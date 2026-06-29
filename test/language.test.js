import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage } from '../src/services/language.js';

test('detects Haitian Creole first when clear', () => {
  assert.equal(detectLanguage('Bonjou, mwen bezwen ed pou travay la.'), 'ht');
});

test('detects French', () => {
  assert.equal(detectLanguage("Bonjour, j'ai besoin d'aide aujourd'hui."), 'fr');
});

test('detects English', () => {
  assert.equal(detectLanguage('Hello, I need help with work today.'), 'en');
});

test('defaults to Haitian Creole when unsure', () => {
  assert.equal(detectLanguage('12345'), 'ht');
});
