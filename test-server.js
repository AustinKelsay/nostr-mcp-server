import { spawn } from 'child_process';

// Função para testar o servidor MCP
function testMcpServer() {
  console.log('Iniciando o servidor MCP simplificado...');
  
  // Iniciar o servidor MCP
  const server = spawn('node', ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Enviar uma mensagem de inicialização simulada
  const initMessage = {
    method: "initialize",
    params: {
      serverInfo: {
        name: "test-client",
        version: "1.0.0"
      },
      capabilities: {}
    },
    id: 1
  };

  // Quando o servidor estiver pronto para receber dados
  server.stdout.on('data', (data) => {
    console.log(`Saída do servidor: ${data}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`Erro do servidor: ${data}`);
  });

  server.on('close', (code) => {
    console.log(`Servidor encerrado com código ${code}`);
  });

  // Simular envio de uma requisição de lista de ferramentas após um pequeno atraso
  setTimeout(() => {
    if (!server.killed) {
      const listToolsRequest = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "tools/list"
      };
      
      console.log('Enviando requisição de lista de ferramentas...');
      server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    }
  }, 1000);

  // Terminar após 3 segundos
  setTimeout(() => {
    if (!server.killed) {
      server.kill();
    }
  }, 3000);
}

testMcpServer();