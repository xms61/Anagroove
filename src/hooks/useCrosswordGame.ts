import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Puzzle, Clue, Direction, CellValidity } from '../types/crossword';
import { apiClient } from '../services/apiClient';
import { socketService, MultiplayerRoom } from '../services/socketService';
import confetti from 'canvas-confetti';

interface UseCrosswordGameOptions {
  themeId?: string;
  initialLetters?: string[][];
  initialValidity?: CellValidity[][];
  multiplayerRoom?: MultiplayerRoom | null;
  playerId?: string;
  playerName?: string;
  playerColor?: string;
}

export function useCrosswordGame(puzzle: Puzzle, options: UseCrosswordGameOptions = {}) {
  const {
    themeId = 'mixed',
    initialLetters,
    initialValidity,
    multiplayerRoom,
    playerId,
    playerName,
    playerColor,
  } = options;

  // User input grid: 2D array of string
  const [userLetters, setUserLetters] = useState<string[][]>(() => {
    if (initialLetters && initialLetters.length === puzzle.rows && initialLetters[0]?.length === puzzle.cols) {
      return initialLetters;
    }
    return Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill(''));
  });

  // Validity matrix: 'untested' | 'correct' | 'wrong'
  const [validity, setValidity] = useState<CellValidity[][]>(() => {
    if (initialValidity && initialValidity.length === puzzle.rows && initialValidity[0]?.length === puzzle.cols) {
      return initialValidity;
    }
    return Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('untested'));
  });

  // Active cursor position
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({
    row: puzzle.clues[0]?.row ?? 0,
    col: puzzle.clues[0]?.col ?? 0,
  });

  // Active direction: 'across' | 'down'
  const [direction, setDirection] = useState<Direction>(puzzle.clues[0]?.direction ?? 'across');

  // Victory / Completed state
  const [isCompleted, setIsCompleted] = useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [audioPlayTrigger, setAudioPlayTrigger] = useState(0);

  // Staggered celebration bounce animation when a typed word is correct
  const [celebratingCells, setCelebratingCells] = useState<{ row: number; col: number; delay: number }[]>([]);

  // Debounced server auto-save ref
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when puzzle changes
  useEffect(() => {
    if (initialLetters && initialLetters.length === puzzle.rows && initialLetters[0]?.length === puzzle.cols) {
      setUserLetters(initialLetters);
    } else {
      setUserLetters(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('')));
    }

    if (initialValidity && initialValidity.length === puzzle.rows && initialValidity[0]?.length === puzzle.cols) {
      setValidity(initialValidity);
    } else {
      setValidity(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('untested')));
    }

    const firstClue = puzzle.clues[0];
    if (firstClue) {
      setSelectedCell({ row: firstClue.row, col: firstClue.col });
      setDirection(firstClue.direction);
    }
    setIsCompleted(false);
    setShowEndScreen(false);
  }, [puzzle.id]);

  // Debounced server auto-save
  const scheduleServerSave = useCallback((letters: string[][], val: CellValidity[][]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      apiClient.saveProgress(puzzle.id, themeId, letters, val);
    }, 500);
  }, [puzzle.id, themeId]);

  // Find clues matching the current cell
  const acrossClueForSelected = useMemo(() => {
    return puzzle.clues.find(
      c =>
        c.direction === 'across' &&
        c.row === selectedCell.row &&
        selectedCell.col >= c.col &&
        selectedCell.col < c.col + c.length
    );
  }, [puzzle, selectedCell]);

  const downClueForSelected = useMemo(() => {
    return puzzle.clues.find(
      c =>
        c.direction === 'down' &&
        c.col === selectedCell.col &&
        selectedCell.row >= c.row &&
        selectedCell.row < c.row + c.length
    );
  }, [puzzle, selectedCell]);

  // Current active clue based on cell & direction
  const activeClue: Clue | undefined = useMemo(() => {
    if (direction === 'across') {
      return acrossClueForSelected || downClueForSelected;
    } else {
      return downClueForSelected || acrossClueForSelected;
    }
  }, [direction, acrossClueForSelected, downClueForSelected]);

  // Cells belonging to the active clue
  const activeWordCells = useMemo(() => {
    if (!activeClue) return [];
    const cells: { row: number; col: number }[] = [];
    for (let i = 0; i < activeClue.length; i++) {
      cells.push({
        row: activeClue.direction === 'across' ? activeClue.row : activeClue.row + i,
        col: activeClue.direction === 'across' ? activeClue.col + i : activeClue.col,
      });
    }
    return cells;
  }, [activeClue]);

  const isCellInActiveWord = useCallback(
    (r: number, c: number) => {
      return activeWordCells.some(cell => cell.row === r && cell.col === c);
    },
    [activeWordCells]
  );

  // Validate entire board
  const validateGrid = useCallback((currentLetters: string[][]) => {
    let allFilled = true;
    let hasError = false;
    let totalTargetLetters = 0;
    let correctLetters = 0;

    const newValidity: CellValidity[][] = Array.from({ length: puzzle.rows }, () =>
      Array(puzzle.cols).fill('untested')
    );

    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        const cell = puzzle.grid[r][c];
        if (!cell.isBlock && cell.char) {
          totalTargetLetters++;
          const userVal = currentLetters[r][c].toUpperCase();
          if (!userVal) {
            allFilled = false;
          } else if (userVal === cell.char.toUpperCase()) {
            newValidity[r][c] = 'correct';
            correctLetters++;
          } else {
            newValidity[r][c] = 'wrong';
            hasError = true;
          }
        }
      }
    }

    setValidity(newValidity);
    scheduleServerSave(currentLetters, newValidity);

    // If multiplayer versus race mode, broadcast progress %
    if (multiplayerRoom?.mode === 'race' && playerId) {
      const pct = Math.round((correctLetters / (totalTargetLetters || 1)) * 100);
      socketService.sendRaceProgress(multiplayerRoom.code, pct, playerId);
    }

    if (allFilled && !hasError) {
      setIsCompleted(true);
      setShowEndScreen(true);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      // Record solved puzzle to server
      apiClient.recordSolved(puzzle.id, puzzle.title, puzzle.clues.length);

      // Notify multiplayer room of win
      if (multiplayerRoom && playerId) {
        socketService.sendPuzzleSolved(multiplayerRoom.code, playerId, playerName || 'Player');
      }
    } else {
      setIsCompleted(false);
    }
    return { allFilled, isAllCorrect: allFilled && !hasError };
  }, [puzzle, scheduleServerSave, multiplayerRoom, playerId, playerName]);

  const selectClue = useCallback((clue: Clue) => {
    setDirection(clue.direction);
    setAudioPlayTrigger(prev => prev + 1);
    for (let i = 0; i < clue.length; i++) {
      const r = clue.direction === 'across' ? clue.row : clue.row + i;
      const c = clue.direction === 'across' ? clue.col + i : clue.col;
      if (!userLetters[r][c]) {
        setSelectedCell({ row: r, col: c });
        return;
      }
    }
    setSelectedCell({ row: clue.row, col: clue.col });
  }, [userLetters]);

  const selectCell = useCallback((row: number, col: number) => {
    const cell = puzzle.grid[row][col];
    if (cell.isBlock) return;

    setAudioPlayTrigger(prev => prev + 1);

    if (selectedCell.row === row && selectedCell.col === col) {
      const hasAcross = puzzle.clues.some(
        c => c.direction === 'across' && c.row === row && col >= c.col && col < c.col + c.length
      );
      const hasDown = puzzle.clues.some(
        c => c.direction === 'down' && c.col === col && row >= c.row && row < c.row + c.length
      );
      if (hasAcross && hasDown) {
        setDirection(prev => (prev === 'across' ? 'down' : 'across'));
      }
    } else {
      setSelectedCell({ row, col });
      const validAcross = puzzle.clues.some(
        c => c.direction === 'across' && c.row === row && col >= c.col && col < c.col + c.length
      );
      const validDown = puzzle.clues.some(
        c => c.direction === 'down' && c.col === col && row >= c.row && row < c.row + c.length
      );

      if (direction === 'across' && !validAcross && validDown) {
        setDirection('down');
      } else if (direction === 'down' && !validDown && validAcross) {
        setDirection('across');
      }
    }
  }, [puzzle, selectedCell, direction]);

  const handleInputLetter = useCallback((char: string) => {
    const uppercase = char.toUpperCase();
    let newLetters: string[][] = [];
    setUserLetters(prev => {
      newLetters = prev.map(row => [...row]);
      newLetters[selectedCell.row][selectedCell.col] = uppercase;
      return newLetters;
    });

    // If in multiplayer co-op room, broadcast typed cell to teammates
    if (multiplayerRoom?.mode === 'coop' && playerId) {
      socketService.sendCoopCellUpdate(
        multiplayerRoom.code,
        selectedCell.row,
        selectedCell.col,
        uppercase,
        playerId,
        playerName || 'Teammate',
        playerColor || '#1db954'
      );
    }

    if (validity[selectedCell.row][selectedCell.col] !== 'untested') {
      const newValidity = validity.map(row => [...row]);
      newValidity[selectedCell.row][selectedCell.col] = 'untested';
      setValidity(newValidity);
    }

    scheduleServerSave(newLetters, validity);

    // Advance cursor to next cell in active clue
    if (activeClue) {
      const idxInWord =
        direction === 'across'
          ? selectedCell.col - activeClue.col
          : selectedCell.row - activeClue.row;

      if (idxInWord + 1 < activeClue.length) {
        const nextR = direction === 'across' ? activeClue.row : activeClue.row + idxInWord + 1;
        const nextC = direction === 'across' ? activeClue.col + idxInWord + 1 : activeClue.col;
        setSelectedCell({ row: nextR, col: nextC });
      }
    }

    // Check if the typed word is completely filled and correct -> trigger small celebration bounce
    if (activeClue) {
      let isWordFilled = true;
      let typedWord = '';
      for (let i = 0; i < activeClue.length; i++) {
        const cr = activeClue.direction === 'across' ? activeClue.row : activeClue.row + i;
        const cc = activeClue.direction === 'across' ? activeClue.col + i : activeClue.col;
        const char = newLetters[cr]?.[cc];
        if (!char) {
          isWordFilled = false;
          break;
        }
        typedWord += char;
      }

      if (isWordFilled && typedWord.toUpperCase() === activeClue.answer.toUpperCase()) {
        const cells = Array.from({ length: activeClue.length }, (_, i) => ({
          row: activeClue.direction === 'across' ? activeClue.row : activeClue.row + i,
          col: activeClue.direction === 'across' ? activeClue.col + i : activeClue.col,
          delay: i * 50,
        }));
        setCelebratingCells(cells);
        setTimeout(() => setCelebratingCells([]), 1200);
      }
    }

    // Auto check if full
    let isFull = true;
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c].isBlock && !newLetters[r][c]) {
          isFull = false;
          break;
        }
      }
      if (!isFull) break;
    }

    if (isFull) {
      validateGrid(newLetters);
    }
  }, [selectedCell, validity, activeClue, direction, puzzle, validateGrid, scheduleServerSave, multiplayerRoom, playerId, playerName, playerColor]);

  const handleBackspace = useCallback(() => {
    let newLetters: string[][] = [];
    const currentHasChar = userLetters[selectedCell.row][selectedCell.col] !== '';

    if (currentHasChar) {
      setUserLetters(prev => {
        newLetters = prev.map(row => [...row]);
        newLetters[selectedCell.row][selectedCell.col] = '';
        return newLetters;
      });
      if (multiplayerRoom?.mode === 'coop' && playerId) {
        socketService.sendCoopCellUpdate(
          multiplayerRoom.code,
          selectedCell.row,
          selectedCell.col,
          '',
          playerId,
          playerName || 'Teammate',
          playerColor || '#1db954'
        );
      }
    } else if (activeClue) {
      const idxInWord =
        direction === 'across'
          ? selectedCell.col - activeClue.col
          : selectedCell.row - activeClue.row;

      if (idxInWord > 0) {
        const prevR = direction === 'across' ? activeClue.row : activeClue.row + idxInWord - 1;
        const prevC = direction === 'across' ? activeClue.col + idxInWord - 1 : activeClue.col;
        setSelectedCell({ row: prevR, col: prevC });
        setUserLetters(prev => {
          newLetters = prev.map(row => [...row]);
          newLetters[prevR][prevC] = '';
          return newLetters;
        });
        if (multiplayerRoom?.mode === 'coop' && playerId) {
          socketService.sendCoopCellUpdate(
            multiplayerRoom.code,
            prevR,
            prevC,
            '',
            playerId,
            playerName || 'Teammate',
            playerColor || '#1db954'
          );
        }
      }
    }

    scheduleServerSave(newLetters, validity);
  }, [selectedCell, activeClue, direction, validity, scheduleServerSave, multiplayerRoom, playerId, playerName, playerColor, userLetters]);

  const moveCursor = useCallback((deltaR: number, deltaC: number) => {
    let r = selectedCell.row + deltaR;
    let c = selectedCell.col + deltaC;

    while (r >= 0 && r < puzzle.rows && c >= 0 && c < puzzle.cols) {
      if (!puzzle.grid[r][c].isBlock) {
        setSelectedCell({ row: r, col: c });
        return;
      }
      r += deltaR;
      c += deltaC;
    }
  }, [selectedCell, puzzle]);

  const nextClue = useCallback(() => {
    if (!activeClue) return;
    const currentIndex = puzzle.clues.findIndex(c => c.id === activeClue.id);
    const nextIndex = (currentIndex + 1) % puzzle.clues.length;
    selectClue(puzzle.clues[nextIndex]);
  }, [activeClue, puzzle.clues, selectClue]);

  const prevClue = useCallback(() => {
    if (!activeClue) return;
    const currentIndex = puzzle.clues.findIndex(c => c.id === activeClue.id);
    const prevIndex = (currentIndex - 1 + puzzle.clues.length) % puzzle.clues.length;
    selectClue(puzzle.clues[prevIndex]);
  }, [activeClue, puzzle.clues, selectClue]);

  const applyHint = useCallback((type: 'letter' | 'word' | 'puzzle') => {
    const newLetters = userLetters.map(row => [...row]);
    const newValidity = validity.map(row => [...row]);

    if (type === 'letter') {
      const cell = puzzle.grid[selectedCell.row][selectedCell.col];
      if (!cell.isBlock && cell.char) {
        const correctChar = cell.char.toUpperCase();
        newLetters[selectedCell.row][selectedCell.col] = correctChar;
        newValidity[selectedCell.row][selectedCell.col] = 'correct';

        if (multiplayerRoom?.mode === 'coop' && playerId) {
          socketService.sendCoopCellUpdate(
            multiplayerRoom.code,
            selectedCell.row,
            selectedCell.col,
            correctChar,
            playerId,
            playerName || 'Teammate',
            playerColor || '#1db954'
          );
        }

        // Advance cursor to next cell in active clue
        if (activeClue) {
          const idxInWord =
            direction === 'across'
              ? selectedCell.col - activeClue.col
              : selectedCell.row - activeClue.row;

          if (idxInWord + 1 < activeClue.length) {
            const nextR = direction === 'across' ? activeClue.row : activeClue.row + idxInWord + 1;
            const nextC = direction === 'across' ? activeClue.col + idxInWord + 1 : activeClue.col;
            setSelectedCell({ row: nextR, col: nextC });
          }
        }
      }
    } else if (type === 'word' && activeClue) {
      for (let i = 0; i < activeClue.length; i++) {
        const r = activeClue.direction === 'across' ? activeClue.row : activeClue.row + i;
        const c = activeClue.direction === 'across' ? activeClue.col + i : activeClue.col;
        const expected = puzzle.grid[r][c].char;
        if (expected) {
          const correctChar = expected.toUpperCase();
          newLetters[r][c] = correctChar;
          newValidity[r][c] = 'correct';

          if (multiplayerRoom?.mode === 'coop' && playerId) {
            socketService.sendCoopCellUpdate(
              multiplayerRoom.code,
              r,
              c,
              correctChar,
              playerId,
              playerName || 'Teammate',
              playerColor || '#1db954'
            );
          }
        }
      }

      // Advance to next clue
      const currentIndex = puzzle.clues.findIndex(clue => clue.id === activeClue.id);
      if (currentIndex !== -1 && puzzle.clues.length > 1) {
        const nextIndex = (currentIndex + 1) % puzzle.clues.length;
        selectClue(puzzle.clues[nextIndex]);
      }
    } else if (type === 'puzzle') {
      for (let r = 0; r < puzzle.rows; r++) {
        for (let c = 0; c < puzzle.cols; c++) {
          const expected = puzzle.grid[r][c].char;
          if (expected) {
            newLetters[r][c] = expected.toUpperCase();
            newValidity[r][c] = 'correct';
          }
        }
      }
    }

    setUserLetters(newLetters);
    setValidity(newValidity);

    // Check if entire puzzle is filled and correct without auto-checking untested cells
    let allFilledAndCorrect = true;
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        const expected = puzzle.grid[r][c].char;
        if (expected && newLetters[r][c] !== expected.toUpperCase()) {
          allFilledAndCorrect = false;
          break;
        }
      }
      if (!allFilledAndCorrect) break;
    }

    if (allFilledAndCorrect) {
      setIsCompleted(true);
      setShowEndScreen(true);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      apiClient.recordSolved(puzzle.id, puzzle.title, puzzle.clues.length);
      if (multiplayerRoom && playerId) {
        socketService.sendPuzzleSolved(multiplayerRoom.code, playerId, playerName || 'Player');
      }
    }

    scheduleServerSave(newLetters, newValidity);
  }, [userLetters, validity, puzzle, selectedCell, activeClue, direction, scheduleServerSave, multiplayerRoom, playerId, playerName, playerColor, selectClue]);

  return {
    userLetters,
    setUserLetters,
    validity,
    setValidity,
    selectedCell,
    direction,
    activeClue,
    audioPlayTrigger,
    celebratingCells,
    isCompleted,
    setIsCompleted,
    showEndScreen,
    setShowEndScreen,
    isCellInActiveWord,
    selectCell,
    selectClue,
    handleInputLetter,
    handleBackspace,
    moveCursor,
    nextClue,
    prevClue,
    applyHint,
    validateGrid: () => validateGrid(userLetters),
  };
}
