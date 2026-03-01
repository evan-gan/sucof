/**
 * Ollama Model Manager
 * Handles starting, querying, and unloading Ollama models
 * 
 * QUICK START EXAMPLES:
 * 
 * 1. Dev Test Mode (select model by number):
 *    $ node ollama.js
 * 
 * 2. Interactive Mode:
 *    $ node ollama.js interactive gemma2
 * 
 * 3. Programmatic Usage - Ask gemma2 a question:
 *    
 *    const OllamaManager = require('./ollama.js');
 *    
 *    (async () => {
 *      const ollama = new OllamaManager('gemma2');
 *      
 *      // Check server is running
 *      const running = await ollama.checkOllamaServer();
 *      if (!running) {
 *        console.error('Ollama server not running');
 *        return;
 *      }
 *      
 *      // Load model into memory
 *      await ollama.loadModel();
 *      
 *      // Ask a question
 *      const response = await ollama.ask('What is the capital of France?');
 *      console.log('Answer:', response);
 *      
 *      // Unload when done
 *      await ollama.unloadModel();
 *    })();
 */

const OLLAMA_API_URL = 'http://localhost:11434/api';
const DEFAULT_MODEL = 'gemma3:4b'; // You can change this to other models like 'neural-chat', 'llama2', etc.

class OllamaManager {
  constructor(modelName = DEFAULT_MODEL) {
    this.modelName = modelName;
    this.isLoaded = false;
  }

  /**
   * Check if Ollama is running
   */
  async checkOllamaServer() {
    try {
      const response = await fetch(`${OLLAMA_API_URL}/tags`);
      return response.ok;
    } catch (error) {
      console.error('Ollama server not accessible:', error);
      return false;
    }
  }

  /**
   * Pull and load a model into memory
   */
  async loadModel() {
    try {
      console.log(`Loading model: ${this.modelName}...`);
      
      const response = await fetch(`${OLLAMA_API_URL}/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to load model: ${response.statusText}`);
      }

      // Stream the response to show progress
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              console.log(`[Pull Status] ${data.status}`);
            }
            if (data.digest && data.completed && data.total) {
              const progress = ((data.completed / data.total) * 100).toFixed(1);
              console.log(`[Download] ${progress}%`);
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }

      this.isLoaded = true;
      console.log(`✓ Model ${this.modelName} loaded successfully!`);
      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      return false;
    }
  }

  /**
   * Ask a question to the loaded model
   */
  async ask(question) {
    if (!this.isLoaded) {
      console.warn('Model not loaded. Call loadModel() first.');
      return null;
    }

    try {
      console.log(`\nQuestion: ${question}`);
      console.log('Thinking...\n');

      const response = await fetch(`${OLLAMA_API_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          prompt: question,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate response: ${response.statusText}`);
      }

      let fullResponse = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              process.stdout.write(data.response); // Print response in real-time
              fullResponse += data.response;
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }

      console.log('\n');
      return fullResponse;
    } catch (error) {
      console.error('Error generating response:', error);
      return null;
    }
  }

  /**
   * Unload model from memory
   */
  async unloadModel() {
    try {
      console.log(`Unloading model: ${this.modelName}...`);

      // Send DELETE request to remove model from memory
      const response = await fetch(`${OLLAMA_API_URL}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to unload model: ${response.statusText}`);
      }

      this.isLoaded = false;
      console.log(`✓ Model ${this.modelName} unloaded successfully!`);
      return true;
    } catch (error) {
      console.error('Error unloading model:', error);
      return false;
    }
  }

  /**
   * Get list of available models
   */
  async getAvailableModels() {
    try {
      const response = await fetch(`${OLLAMA_API_URL}/tags`);
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }
}

/**
 * Dev test function - Run with predefined test questions
 */
async function devTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 OLLAMA DEV TEST MODE');
  console.log('='.repeat(60) + '\n');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  try {
    const tempOllama = new OllamaManager();

    // Check if Ollama server is running
    console.log('📡 Checking Ollama server...');
    const serverRunning = await tempOllama.checkOllamaServer();
    if (!serverRunning) {
      console.error('❌ Ollama server is not running. Please start it first:');
      console.error('   Run: ollama serve');
      console.error('   Or in Docker: docker run -it -v ollama:/root/.ollama -p 11434:11434 ollama/ollama');
      process.exit(1);
    }
    console.log('✓ Ollama server is running\n');

    // Show available models
    console.log('📦 Available models:\n');
    const models = await tempOllama.getAvailableModels();
    if (models.length === 0) {
      console.error('❌ No models found. Please pull a model first:');
      console.error('   Run: ollama pull mistral');
      process.exit(1);
    }

    models.forEach((model, index) => {
      const size = model.size ? ` (${(model.size / 1e9).toFixed(1)}GB)` : '';
      console.log(`   [${index}] ${model.name}${size}`);
    });

    console.log('');
    const modelIndexStr = await question('Select model by number: ');
    const modelIndex = parseInt(modelIndexStr);

    if (isNaN(modelIndex) || modelIndex < 0 || modelIndex >= models.length) {
      console.error('❌ Invalid model selection');
      rl.close();
      process.exit(1);
    }

    const selectedModel = models[modelIndex].name;
    console.log(`\n✓ Selected: ${selectedModel}\n`);
    rl.close();

    // Create ollama instance with selected model
    const ollama = new OllamaManager(selectedModel);

    // Load model into memory
    console.log(`⏳ Loading model: ${selectedModel}`);
    const loaded = await ollama.loadModel();
    if (!loaded) {
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🚀 TESTING MODEL WITH SAMPLE QUESTIONS');
    console.log('='.repeat(60) + '\n');

    // Test questions
    const testQuestions = [
      'What is machine learning? (answer in 2 sentences)',
      'How does a neural network work? (answer in 3 sentences)',
      'What is JavaScript used for? (answer in 1 sentence)',
    ];

    for (let i = 0; i < testQuestions.length; i++) {
      console.log(`\n[Test ${i + 1}/${testQuestions.length}]`);
      console.log('━'.repeat(60));
      await ollama.ask(testQuestions[i]);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🧹 CLEANUP');
    console.log('='.repeat(60) + '\n');

    // Unload model from memory
    await ollama.unloadModel();

    console.log('\n✅ Dev test completed successfully!\n');
  } catch (error) {
    console.error('Error in dev test:', error);
    process.exit(1);
  }
}

/**
 * Interactive mode - Ask custom questions
 */
async function interactiveMode(modelName = 'mistral') {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  try {
    const ollama = new OllamaManager(modelName);

    console.log('\n' + '='.repeat(60));
    console.log('💬 OLLAMA INTERACTIVE MODE');
    console.log('='.repeat(60) + '\n');

    // Check server
    const serverRunning = await ollama.checkOllamaServer();
    if (!serverRunning) {
      console.error('❌ Ollama server not running. Start with: ollama serve');
      process.exit(1);
    }

    // Load model
    console.log(`Loading model: ${modelName}...`);
    const loaded = await ollama.loadModel();
    if (!loaded) {
      process.exit(1);
    }

    console.log('✓ Model loaded!\n');
    console.log('Type your questions below. Type "exit" to quit.\n');

    while (true) {
      const userQuestion = await question('You: ');
      
      if (userQuestion.toLowerCase() === 'exit') {
        break;
      }

      if (userQuestion.trim()) {
        await ollama.ask(userQuestion);
      }
    }

    console.log('\nUnloading model...');
    await ollama.unloadModel();
    rl.close();
  } catch (error) {
    console.error('Error in interactive mode:', error);
    rl.close();
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';
  const model = args[1] || 'mistral';

  switch (command) {
    case 'test':
      await devTest();
      break;
    case 'interactive':
      await interactiveMode(model);
      break;
    case 'help':
      console.log(`
Usage: node ollama.js [command] [model]

Commands:
  test          Run dev tests with sample questions (default) - select model by number
  interactive   Interactive mode - ask custom questions
  help          Show this help message

Examples:
  node ollama.js                    # Run tests - prompts you to select a model
  node ollama.js interactive        # Interactive mode with mistral model
  node ollama.js interactive llama2 # Interactive mode with llama2

Setup:
  Pull a model first: ollama pull mistral
      `);
      break;
    default:
      console.error(`Unknown command: ${command}\nRun: node ollama.js help`);
      process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);

}

module.exports = OllamaManager;
