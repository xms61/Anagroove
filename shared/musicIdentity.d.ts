export interface MusicIdentityTrack {
  provider?: string;
  providerTrackId?: string;
  providerArtistId?: string;
  title: string;
  artist: string;
}

export interface BlacklistIdentityItem {
  type: 'artist' | 'song';
  name: string;
  canonicalKey?: string;
  provider?: string;
  providerTrackId?: string;
  providerArtistId?: string;
}

export declare function canonicalMusicKey(value: unknown): string;
export declare const canonicalArtistKey: typeof canonicalMusicKey;
export declare const canonicalTrackKey: typeof canonicalMusicKey;
export declare function blacklistIdentityKey(item: BlacklistIdentityItem): string;
export declare function toCrosswordAnswer(
  displayName: unknown,
  options?: { minLength?: number; maxLength?: number }
): string | null;
export declare function blacklistMatchesTrack(
  blacklist: BlacklistIdentityItem[],
  track: MusicIdentityTrack
): boolean;
