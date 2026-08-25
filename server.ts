/**
 * DARLEK CANN ARCHITECTURAL HEADER
 * File: server.ts
 * Role: Core system component participating in autonomous cognitive evolution cycles.
 * Architecture: Type-safe modular unit with resilient state interfaces.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { validateEnv } from './lib/env-validator';

dotenv.config();

// Run startup diagnostic health check via lib/env-validator
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.warn(`[DIAGNOSTIC] Missing environment configuration variables: ${envValidation.missing.join(', ')}`);
} else {
  console.log(`[DIAGNOSTIC] Environment validation succeeded. Kernel initialized in ${process.env.NODE_ENV || 'development'} mode.`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Diagnostic health endpoint
  app.get('/api/diagnostic', (_req, res) => {
    const check = validateEnv();
    res.json({
      kernel: 'EMG Core v49',
      status: check.valid ? 'HEALTHY' : 'DEGRADED',
      missing: check.missing,
      nodeEnv: process.env.NODE_ENV || 'development',
      debugMode: process.env.DEBUG_MODE === 'true',
      memoryPath: process.env.MEMORY_PATH || './memory',
      timestamp: new Date().toISOString(),
    });
  });

  // Check API status and environment injection
  app.get('/api/status', (_req, res) => {
    const serverKey = process.env.GEMINI_API_KEY;
    const hasServerKey = Boolean(serverKey && serverKey.trim().length > 0 && serverKey !== 'MY_GEMINI_API_KEY');

    res.json({
      status: 'ok',
      hasServerGeminiKey: hasServerKey,
      autoInjected: hasServerKey,
      defaultModel: 'gemini-3.7-flash',
      supportedModels: [
        { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash (Default, State-of-the-Art)', description: 'Ultra-fast & cutting-edge code synthesis' },
        { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'Fast, high efficiency neural generation' },
        { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Deep Complex Reasoning)', description: 'Maximum reasoning depth for complex ASTs' },
      ],
    });
  });

  // GitHub user repositories proxy
  app.post('/api/github/user-repos', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'GitHub Token is required.' });
      }
      const response = await fetch(
        'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token.trim()}`,
            'User-Agent': 'EMG-Sovereign-Engine',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: `GitHub error (${response.status}): ${errorText}`,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch repositories' });
    }
  });

  // Optimize endpoint using @google/genai
  app.post('/api/optimize', async (req, res) => {
    try {
      const { code, filePath, customApiKey, goal, model } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Missing source code to optimize.' });
      }

      const apiKey = (customApiKey && customApiKey.trim().length > 0)
        ? customApiKey.trim()
        : process.env.GEMINI_API_KEY?.trim();

      // Map any deprecated model names seamlessly
      let targetModel = model || 'gemini-3.7-flash';
      if (targetModel === 'gemini-2.5-flash' || targetModel === 'gemini-2.0-flash' || targetModel === 'gemini-1.5-flash') {
        targetModel = 'gemini-3.6-flash';
      }

      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(400).json({
          error: 'No Gemini API key detected. Please configure GEMINI_API_KEY in Secrets or provide a key in the settings panel.',
          needsKey: true,
        });
      }

      const ai = new GoogleGenAI({ apiKey });

      const directives: Record<string, string> = {
        performance: 'Focus heavily on execution speed, memory footprint reduction, caching, avoiding unnecessary allocations, loop unrolling where sensible, and data structure efficiency.',
        security: 'Focus on defensive input validation, eliminating potential injection/overflow vulnerabilities, volatile memory safety, and strict bounds checking.',
        'type-safety': 'Focus on exhaustive TypeScript types, eliminating "any", strict generic constraints, narrowing, and robust runtime contracts.',
        readability: 'Focus on pristine modern idioms, descriptive naming, modular decomposition, and clean architectural clarity.',
        comprehensive: 'Perform a comprehensive sovereign overhaul: optimize performance, maximize type-safety, enhance memory efficiency, and ensure robust error handling.',
      };

      const directive = directives[goal] || directives['comprehensive'];

      const prompt = `You are EMG Core v49 Neural Code Optimizer Engine.
File Path: "${filePath || 'source.ts'}"
Optimization Goal: ${(goal || 'comprehensive').toUpperCase()} - ${directive}

Original Source Code:
\`\`\`
${code}
\`\`\`

Instructions:
1. Optimize, modernize, and enhance this code strictly according to the goal.
2. Maintain all business logic, export names, and external API contracts intact.
3. Output ONLY the optimized source code between delimiters @@@START and @@@END.
4. Output a 1-sentence summary of enhancements immediately after @@@SUMMARY:`;

      const startTime = performance.now();

      // List of candidate models to try in case of 503 high demand or 429
      const candidateModels = [
        targetModel,
        targetModel === 'gemini-3.7-flash' ? 'gemini-3.6-flash' : 'gemini-3.7-flash',
        'gemini-3.6-flash',
      ].filter((m, idx, arr) => arr.indexOf(m) === idx);

      let response: any = null;
      let lastErr: any = null;
      let usedModel = targetModel;

      for (const m of candidateModels) {
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
          try {
            attempts++;
            response = await ai.models.generateContent({
              model: m,
              contents: prompt,
              config: {
                temperature: 0.2,
                maxOutputTokens: 8192,
              },
            });
            usedModel = m;
            break;
          } catch (err: any) {
            lastErr = err;
            const errStr = String(err?.message || err || '');
            const is503OrUnavailable = errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429');
            
            if (is503OrUnavailable && attempts < maxAttempts) {
              // Wait briefly and retry
              await new Promise(r => setTimeout(r, 700 * attempts));
              continue;
            }
            // If it's a 503 or 404, break to try next candidate model
            break;
          }
        }

        if (response) {
          break;
        }
      }

      if (!response) {
        throw lastErr || new Error('All model candidates are currently experiencing high demand.');
      }

      const rawText = response.text || '';
      let optimized = '';
      let summary = 'Applied neural performance and architecture optimizations.';

      if (rawText.includes('@@@START') && rawText.includes('@@@END')) {
        optimized = rawText.split('@@@START')[1].split('@@@END')[0].trim();
      } else {
        optimized = rawText.replace(/```[a-z]*\n?|```/gi, '').trim();
      }

      if (rawText.includes('@@@SUMMARY:')) {
        summary = rawText.split('@@@SUMMARY:')[1].trim().split('\n')[0];
      }

      if (!optimized || optimized.length < 5) {
        throw new Error('AI Model returned an empty code block.');
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const tokensEstimate = response.usageMetadata?.totalTokenCount || Math.round(rawText.length / 3.8);

      return res.json({
        optimizedCode: optimized,
        summary,
        latencyMs,
        tokensEstimate,
        modelUsed: usedModel,
      });
    } catch (err: any) {
      console.error('Gemini Optimization Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to run neural code optimization' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EMG Core Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
