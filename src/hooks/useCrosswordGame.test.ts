import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import confetti from 'canvas-confetti';
import { apiClient } from '../services/apiClient';
import { makePuzzle } from '../test/fixtures';
import { useCrosswordGame } from './useCrosswordGame';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../services/apiClient', () => ({
  apiClient: { saveProgress: vi.fn(), recordSolved: vi.fn() },
}));
vi.mock('../services/socketService', () => ({
  socketService: { sendCoopCellUpdate: vi.fn(), sendRaceProgress: vi.fn(), sendPuzzleSolved: vi.fn() },
}));

function setup() {
  const puzzle = makePuzzle();
  const hook = renderHook(() => useCrosswordGame(puzzle));
  const type = (text: string) => {
    for (const char of text) act(() => hook.result.current.handleInputLetter(char));
  };
  return { puzzle, ...hook, type };
}

describe('useCrosswordGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiClient.saveProgress).mockReset();
    vi.mocked(apiClient.recordSolved).mockReset();
    vi.mocked(confetti).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty on the first clue', () => {
    const { result } = setup();
    expect(result.current.userLetters.flat().every(letter => letter === '')).toBe(true);
    expect(result.current.selectedCell).toEqual({ row: 0, col: 0 });
    expect(result.current.direction).toBe('across');
    expect(result.current.activeClue?.id).toBe('1A');
  });

  it('uppercases typed letters and advances along the word', () => {
    const { result, type } = setup();
    type('ca');
    expect(result.current.userLetters[0]).toEqual(['C', 'A', '']);
    expect(result.current.selectedCell).toEqual({ row: 0, col: 2 });
  });

  it('backspace clears the current letter, then steps back and clears the previous one', () => {
    const { result, type } = setup();
    type('CA');
    act(() => result.current.selectCell(0, 1));
    act(() => result.current.handleBackspace());
    expect(result.current.userLetters[0]).toEqual(['C', '', '']);
    act(() => result.current.handleBackspace());
    expect(result.current.userLetters[0]).toEqual(['', '', '']);
    expect(result.current.selectedCell).toEqual({ row: 0, col: 0 });
  });

  it('clicking the selected crossing cell toggles direction', () => {
    const { result } = setup();
    act(() => result.current.selectCell(0, 0));
    expect(result.current.direction).toBe('down');
    expect(result.current.activeClue?.id).toBe('1D');
  });

  it('arrow movement skips blocks and ignores clicks on them', () => {
    const { result } = setup();
    act(() => result.current.selectCell(1, 1));
    expect(result.current.selectedCell).toEqual({ row: 0, col: 0 });
    act(() => result.current.moveCursor(1, 0));
    act(() => result.current.moveCursor(1, 0));
    expect(result.current.selectedCell).toEqual({ row: 2, col: 0 });
  });

  it('solving the grid completes the puzzle once and records the solve', () => {
    const { result, type, puzzle } = setup();
    type('CAT');
    act(() => result.current.selectClue(puzzle.clues[1]));
    expect(result.current.selectedCell).toEqual({ row: 1, col: 0 });
    type('OW');
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.showEndScreen).toBe(true);
    expect(apiClient.recordSolved).toHaveBeenCalledTimes(1);
    expect(apiClient.recordSolved).toHaveBeenCalledWith('puzzle-1', 'Test Puzzle', 2, expect.any(Number));
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it('a full grid with a wrong letter marks that cell and does not complete', () => {
    const { result, type, puzzle } = setup();
    type('CAR');
    act(() => result.current.selectClue(puzzle.clues[1]));
    type('OW');
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.validity[0][2]).toBe('wrong');
    expect(result.current.validity[0][1]).toBe('correct');
    expect(apiClient.recordSolved).not.toHaveBeenCalled();
  });

  it('word hint fills the active word and moves to the next clue; puzzle hint solves', () => {
    const { result } = setup();
    act(() => result.current.applyHint('word'));
    expect(result.current.userLetters[0]).toEqual(['C', 'A', 'T']);
    expect(result.current.activeClue?.id).toBe('1D');
    act(() => result.current.applyHint('puzzle'));
    expect(result.current.isCompleted).toBe(true);
    expect(apiClient.recordSolved).toHaveBeenCalledTimes(1);
  });

  it('debounces progress saves and sends the latest grid', () => {
    const { type } = setup();
    type('CA');
    expect(apiClient.saveProgress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(apiClient.saveProgress).toHaveBeenCalledTimes(1);
    const [, , letters] = vi.mocked(apiClient.saveProgress).mock.calls[0];
    expect(letters[0]).toEqual(['C', 'A', '']);
  });

  it('typing while another update is pending still saves and completes the real grid', () => {
    const { result, type, puzzle } = setup();
    type('CA');
    act(() => result.current.selectClue(puzzle.clues[1]));
    type('OW');
    act(() => result.current.selectClue(puzzle.clues[0]));
    act(() => result.current.moveCursor(0, 2));
    // Any queued state update (a timer, a socket message) defers React's updater functions
    act(() => {
      result.current.setShowEndScreen(true);
      result.current.handleInputLetter('T');
    });
    expect(result.current.userLetters[0]).toEqual(['C', 'A', 'T']);
    expect(result.current.isCompleted).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    const [, , letters] = vi.mocked(apiClient.saveProgress).mock.calls.at(-1)!;
    expect(letters).toEqual([['C', 'A', 'T'], ['O', '', ''], ['W', '', '']]);
  });
});
