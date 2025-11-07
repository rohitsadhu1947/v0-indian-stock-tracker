/**
 * Test script to check which Gemini models are available
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');
console.log('');

const genAI = new GoogleGenerativeAI(apiKey);

// Test different model names
const modelsToTest = [
  'gemini-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'models/gemini-pro',
  'models/gemini-1.5-pro',
  'models/gemini-1.5-flash',
];

async function testModel(modelName) {
  try {
    console.log(`Testing: ${modelName}...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const prompt = "Say 'OK' if you can read this.";
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    console.log(`✅ ${modelName} works! Response: ${response}`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing Gemini models...\n');
  
  for (const modelName of modelsToTest) {
    const works = await testModel(modelName);
    if (works) {
      console.log('\n🎉 Found working model:', modelName);
      console.log('Use this in your code!\n');
      break;
    }
    console.log('');
  }
}

main().catch(console.error);

