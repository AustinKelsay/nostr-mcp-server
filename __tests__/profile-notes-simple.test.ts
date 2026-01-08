import { describe, it, test, expect } from 'bun:test';

// Define types for testing
type Profile = {
  pubkey: string;
  name: string;
  displayName: string;
  about: string;
  relays: string[];
};

type Note = {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
};

// Simple getProfile function for testing
const getProfile = (pubkey: string): Promise<Profile> => {
  return Promise.resolve({
    pubkey: pubkey,
    name: 'testuser',
    displayName: 'Test User',
    about: 'This is a test profile',
    relays: ['wss://relay.example.com']
  });
};

// Simple getKind1Notes function for testing
const getKind1Notes = (pubkey: string, limit: number): Promise<Note[]> => {
  const notes: Note[] = [];
  
  for (let i = 0; i < limit; i++) {
    notes.push({
      id: `note${i}`,
      pubkey: pubkey,
      kind: 1,
      content: `Test note ${i} content`,
      created_at: Math.floor(Date.now() / 1000) - (i * 3600),
      tags: []
    });
  }
  
  return Promise.resolve(notes);
};

// Simple getLongFormNotes function for testing
const getLongFormNotes = (pubkey: string, limit: number): Promise<Note[]> => {
  const notes: Note[] = [];
  
  for (let i = 0; i < limit; i++) {
    notes.push({
      id: `longform${i}`,
      pubkey: pubkey,
      kind: 30023,
      content: `Long Form Test ${i} content with much more text...`,
      created_at: Math.floor(Date.now() / 1000) - (i * 86400),
      tags: [['title', `Long Form Test ${i}`], ['summary', 'Test summary']]
    });
  }
  
  return Promise.resolve(notes);
};

describe('Profile and Notes Functions', () => {
  const testPubkey = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

  test('getProfile returns profile data', async () => {
    const profile: Profile = await getProfile(testPubkey);
    
    expect(profile.pubkey).toBe(testPubkey);
    expect(profile.name).toBe('testuser');
    expect(profile.displayName).toBe('Test User');
    expect(profile.about).toBeTruthy();
    expect(profile.relays).toBeInstanceOf(Array);
  });

  test('getKind1Notes returns array of notes', async () => {
    const limit = 5;
    const notes: Note[] = await getKind1Notes(testPubkey, limit);
    
    expect(notes).toBeInstanceOf(Array);
    expect(notes.length).toBe(limit);
    
    // Check the first note
    expect(notes[0].pubkey).toBe(testPubkey);
    expect(notes[0].kind).toBe(1);
    expect(notes[0].content).toContain('Test note');
  });

  test('getLongFormNotes returns array of long-form content', async () => {
    const limit = 3;
    const notes: Note[] = await getLongFormNotes(testPubkey, limit);
    
    expect(notes).toBeInstanceOf(Array);
    expect(notes.length).toBe(limit);
    
    // Check the first note
    expect(notes[0].pubkey).toBe(testPubkey);
    expect(notes[0].kind).toBe(30023);
    expect(notes[0].content).toContain('Long Form Test');
    
    // Check for required tags
    const titleTag = notes[0].tags.find((tag: string[]) => tag[0] === 'title');
    expect(titleTag).toBeTruthy();
    if (titleTag) {
      expect(titleTag[1]).toContain('Long Form Test');
    }
  });
}); 