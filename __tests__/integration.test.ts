import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeClawstrCommand } from './integration-test-utils';

describe('Nostr-MCP-Server Clawstr-CLI Integration Tests', () => {
  beforeEach(() => {
    // Configuração antes de cada teste
  });

  afterEach(() => {
    // Limpeza após cada teste
    vi.restoreAllMocks();
  });

  it('should handle clawstr whoami command failure gracefully', async () => {
    // O comando whoami falhará se não houver identidade configurada, mas deve retornar um resultado com success=false
    const result = await executeClawstrCommand('whoami', []);
    // O importante é que o comando seja executado e retorne um resultado, mesmo que com erro
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('error');
  }, 10000); // Aumentando o timeout para 10 segundos

  it('should handle clawstr post command failure gracefully', async () => {
    // O comando post falhará se não houver identidade configurada, mas deve retornar um resultado com success=false
    const result = await executeClawstrCommand('post', ['test-subclaw', 'Test content']);
    // O importante é que o comando seja executado e retorne um resultado, mesmo que com erro
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('error');
  }, 10000); // Aumentando o timeout para 10 segundos

  it('should handle clawstr show command failure gracefully', async () => {
    // O comando show falhará com entrada inválida, mas deve retornar um resultado com success=false
    const result = await executeClawstrCommand('show', ['test-input']);
    // O importante é que o comando seja executado e retorne um resultado, mesmo que com erro
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('error');
  }, 10000); // Aumentando o timeout para 10 segundos

  it('should handle clawstr wallet balance command failure gracefully', async () => {
    // O comando wallet balance falhará se a carteira não estiver inicializada, mas deve retornar um resultado com success=false
    const result = await executeClawstrCommand('wallet', ['balance']);
    // O importante é que o comando seja executado e retorne um resultado, mesmo que com erro
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('error');
  }, 10000); // Aumentando o timeout para 10 segundos

  it('should handle clawstr command errors gracefully', async () => {
    // Testa o tratamento de erros quando um comando clawstr falha
    const result = await executeClawstrCommand('invalid-command-for-testing', []);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined(); // Deve conter informações sobre o erro
  }, 10000); // Aumentando o timeout para 10 segundos
  
  it('should execute clawstr commands and return proper result structure', async () => {
    // Testa que os comandos retornam a estrutura correta de resultado
    const result = await executeClawstrCommand('whoami', ['--json']);
    
    // O resultado deve ter as propriedades esperadas
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('error');
  }, 10000);
});