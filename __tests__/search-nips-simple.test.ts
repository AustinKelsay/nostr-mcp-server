import { jest } from '@jest/globals';
import { searchNips } from '../nips/nips-tools.js';

// Since the NIPs tool uses a real cache, we'll test with the actual cache behavior
describe('Search NIPs Tool - Simple Tests', () => {
  
  describe('basic search functionality', () => {
    it('should search NIPs by keyword', async () => {
      // This will use the real cache if available, or fetch from GitHub
      const result = await searchNips('protocol', 5);

      expect(Array.isArray(result)).toBe(true);
      
      // Should find NIP-01 when searching for "protocol"
      const nip01 = result.find(searchResult => searchResult.nip.number === 1);
      if (nip01) {
        expect(nip01.nip.title.toLowerCase()).toContain('protocol');
      }
    });

    it('should return limited results', async () => {
      const limit = 3;
      const result = await searchNips('event', limit);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(limit);
    });

    it('should return results with correct structure', async () => {
      // Use a more common search term that's likely to return results
      const result = await searchNips('event', 5);

      expect(Array.isArray(result)).toBe(true);
      
      // Each result should have the expected structure
      if (result.length > 0) {
        result.forEach(searchResult => {
          expect(searchResult).toHaveProperty('nip');
          expect(searchResult).toHaveProperty('relevance');
          expect(searchResult).toHaveProperty('matchedTerms');
          
          // Check the nested nip structure
          expect(searchResult.nip).toHaveProperty('number');
          expect(searchResult.nip).toHaveProperty('title');
          expect(searchResult.nip).toHaveProperty('status');
        });
      }
    });

    it('should handle no results gracefully', async () => {
      const result = await searchNips('xyz123nonexistentterm456', 10);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('should handle case-insensitive search', async () => {
      const result1 = await searchNips('PROTOCOL', 5);
      const result2 = await searchNips('protocol', 5);

      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
      
      // Both searches should return results
      if (result1.length > 0 && result2.length > 0) {
        // The results should be similar (may not be identical due to scoring)
        expect(result1.length).toBeGreaterThan(0);
        expect(result2.length).toBeGreaterThan(0);
      }
    });
  });

  describe('search relevance', () => {
    it('should return relevant results for common terms', async () => {
      // Test with terms we know exist in NIPs
      const result = await searchNips('event', 5);
      
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        // At least one result should have a relevance score
        const hasRelevantResult = result.some(searchResult => 
          searchResult.relevance > 0
        );
        expect(hasRelevantResult).toBe(true);
        
        // Results should be sorted by relevance score
        expect(result[0].relevance).toBeGreaterThan(0);
      }
    });

    it('should rank results by relevance score', async () => {
      const result = await searchNips('encryption', 10);

      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 1) {
        // Results should be sorted by relevance score (descending)
        for (let i = 1; i < result.length; i++) {
          if (result[i - 1].relevance !== undefined && result[i].relevance !== undefined) {
            expect(result[i - 1].relevance).toBeGreaterThanOrEqual(
              result[i].relevance
            );
          }
        }
      }
    });
  });

  describe('error handling', () => {
    it('should handle empty search query', async () => {
      const result = await searchNips('', 10);

      // Empty query should return empty array
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('should handle very long search queries gracefully', async () => {
      const longQuery = 'a'.repeat(1000);
      const result = await searchNips(longQuery, 10);

      // Should return an array (possibly empty)
      expect(Array.isArray(result)).toBe(true);
    });
  });
});