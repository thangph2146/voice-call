/**
 * Demo script để test logger functionality
 * Chạy trong browser console để test các tính năng logger
 */

import { logger, log } from '@/lib/logger';

// Test basic logging
console.log('=== Testing Logger ===');

// Test different log levels
logger.debug('This is a debug message', { userId: 123, action: 'login' });
logger.info('This is an info message', { page: 'dashboard' });
logger.warn('This is a warning message', { error: 'deprecated API' });
logger.error('This is an error message', { error: new Error('Test error') });

// Test utility functions
log.debug('Using utility function for debug');
log.info('Using utility function for info');
log.warn('Using utility function for warning');
log.error('Using utility function for error');

// Test speech-related logging
logger.logSpeechStart();
setTimeout(() => {
  logger.logSpeechResult('Xin chào, tôi là người dùng', true);
  logger.logSpeechError('no-speech');
}, 1000);

// Test performance logging
logger.time('test-operation');
setTimeout(() => {
  logger.timeEnd('test-operation');
}, 500);

// Test network logging
logger.logRequest('https://api.example.com/users', 'GET');
setTimeout(() => {
  logger.logResponse('https://api.example.com/users', 200, { users: [] });
}, 200);

// Test Gemini logging
logger.logGeminiRequest('Xin chào, bạn có thể giúp gì cho tôi?');
setTimeout(() => {
  logger.logGeminiResponse('Chào bạn! Tôi có thể giúp bạn với nhiều việc khác nhau.');
}, 300);

// Show current logs
console.log('Current logs:', logger.getLogs());

// Test log level filtering
console.log('Current log level:', logger.getLevel());
logger.setLevel(2); // Set to WARN level
console.log('New log level:', logger.getLevel());

console.log('=== Logger Test Complete ===');
