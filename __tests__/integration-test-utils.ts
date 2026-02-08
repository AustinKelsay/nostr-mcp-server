import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Função auxiliar para executar comandos clawstr-cli
 * Esta função replica a lógica presente no servidor para fins de teste
 */
export async function executeClawstrCommand(command: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Junta o comando e os argumentos
    const fullCommand = ["clawstr", command, ...args].join(" ");
    
    console.error(`Executing: ${fullCommand}`);
    
    const { stdout, stderr } = await execAsync(fullCommand);
    
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return { success: false, output: stdout, error: stderr };
    }
    
    return { success: true, output: stdout };
  } catch (error: any) {
    console.error(`Error executing clawstr command: ${error.message}`);
    return { success: false, output: "", error: error.message };
  }
}