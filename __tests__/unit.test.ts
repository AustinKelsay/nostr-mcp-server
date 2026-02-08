import { describe, it, expect, vi } from 'vitest';
import { executeClawstrCommand } from './integration-test-utils';

// Mock para simular a execução de comandos clawstr-cli
vi.mock('./integration-test-utils', async () => {
  const actual = await import('./integration-test-utils');
  return {
    ...actual,
    executeClawstrCommand: vi.fn()
  };
});

describe('Nostr-MCP-Server Tool Functions Logic Tests', () => {
  it('should call clawstr init command with correct parameters', async () => {
    const mockExecuteClawstrCommand = vi.mocked(executeClawstrCommand);
    mockExecuteClawstrCommand.mockResolvedValue({ success: true, output: 'Identity initialized' });

    // Simular a função que seria registrada como ferramenta no servidor
    const initIdentityFunction = async ({ name, about }: { name?: string; about?: string }) => {
      const args = [];
      if (name) args.push("--name", name);
      if (about) args.push("--about", about);
      
      const result = await executeClawstrCommand("init", args);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Identity initialized successfully:\n\n${result.output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error initializing identity: ${result.error || result.output}`,
            },
          ],
        };
      }
    };

    // Testar a função com parâmetros
    const toolResult = await initIdentityFunction({ name: 'Test Name', about: 'Test About' });
    
    expect(mockExecuteClawstrCommand).toHaveBeenCalledWith('init', ['--name', 'Test Name', '--about', 'Test About']);
    expect(toolResult.content[0].text).toContain('Identity initialized successfully');
  });

  it('should call clawstr whoami command with correct parameters', async () => {
    const mockExecuteClawstrCommand = vi.mocked(executeClawstrCommand);
    mockExecuteClawstrCommand.mockResolvedValue({ success: true, output: 'npub1test...' });

    // Simular a função que seria registrada como ferramenta no servidor
    const showIdentityFunction = async ({ json }: { json?: boolean }) => {
      const args = json ? ["--json"] : [];
      
      const result = await executeClawstrCommand("whoami", args);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Current identity:\n\n${result.output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error showing identity: ${result.error || result.output}`,
            },
          ],
        };
      }
    };

    const toolResult = await showIdentityFunction({ json: false });
    
    expect(mockExecuteClawstrCommand).toHaveBeenCalledWith('whoami', []);
    expect(toolResult.content[0].text).toContain('Current identity:');
  });

  it('should call clawstr post command with correct parameters', async () => {
    const mockExecuteClawstrCommand = vi.mocked(executeClawstrCommand);
    mockExecuteClawstrCommand.mockResolvedValue({ success: true, output: 'Posted successfully' });

    // Simular a função que seria registrada como ferramenta no servidor
    const postToSubclawFunction = async ({ 
      subclaw, 
      content,
      relays 
    }: { 
      subclaw: string; 
      content: string;
      relays?: string[]; 
    }) => {
      const args = [subclaw, content];
      if (relays && relays.length > 0) {
        args.push("--relay", ...relays);
      }
      
      const result = await executeClawstrCommand("post", args);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Posted successfully:\n\n${result.output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error posting: ${result.error || result.output}`,
            },
          ],
        };
      }
    };

    const toolResult = await postToSubclawFunction({ 
      subclaw: 'test-subclaw', 
      content: 'Test content',
      relays: ['wss://relay.example.com']
    });
    
    expect(mockExecuteClawstrCommand).toHaveBeenCalledWith('post', [
      'test-subclaw', 
      'Test content', 
      '--relay', 
      'wss://relay.example.com'
    ]);
    expect(toolResult.content[0].text).toContain('Posted successfully');
  });

  it('should handle errors from clawstr commands', async () => {
    const mockExecuteClawstrCommand = vi.mocked(executeClawstrCommand);
    mockExecuteClawstrCommand.mockResolvedValue({ 
      success: false, 
      output: '', 
      error: 'Command not found' 
    });

    // Simular a função que seria registrada como ferramenta no servidor
    const showIdentityFunction = async ({ json }: { json?: boolean }) => {
      const args = json ? ["--json"] : [];
      
      const result = await executeClawstrCommand("whoami", args);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Current identity:\n\n${result.output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error showing identity: ${result.error || result.output}`,
            },
          ],
        };
      }
    };

    const toolResult = await showIdentityFunction({ json: false });
    
    expect(toolResult.content[0].text).toContain('Error showing identity: Command not found');
  });

  it('should call clawstr wallet balance command with correct parameters', async () => {
    const mockExecuteClawstrCommand = vi.mocked(executeClawstrCommand);
    mockExecuteClawstrCommand.mockResolvedValue({ success: true, output: 'Balance: 100 sats' });

    // Simular a função que seria registrada como ferramenta no servidor
    const walletBalanceFunction = async ({ json }: { json?: boolean }) => {
      const args = ["balance"];
      if (json) {
        args.push("--json");
      }
      
      const result = await executeClawstrCommand("wallet", args);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Wallet balance:\n\n${result.output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error getting wallet balance: ${result.error || result.output}`,
            },
          ],
        };
      }
    };

    const toolResult = await walletBalanceFunction({ json: false });
    
    expect(mockExecuteClawstrCommand).toHaveBeenCalledWith('wallet', ['balance']);
    expect(toolResult.content[0].text).toContain('Wallet balance:');
  });
});