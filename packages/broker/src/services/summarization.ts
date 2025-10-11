/**
 * SummarizationService
 * Lightweight LLM-based summarizer using OpenAI SDK.
 */

import OpenAI from 'openai';

export class SummarizationService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Summarize text to 1–2 sentences focusing on key facts/actions.
   */
  async summarize(text: string): Promise<string> {
    // Limit prompt size (basic guard)
    const max = parseInt(process.env.MEMORY_SUMMARY_MAX_CHARS || '2000');
    const clipped = text.length > max ? text.slice(0, max) : text;

    const prompt = `Summarize the following message(s) into 1–2 sentences with key facts and actions. Avoid boilerplate.\n\n---\n${clipped}`;

    const resp = await this.openai.chat.completions.create({
      model: process.env.MEMORY_SUMMARY_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise assistant that produces short factual summaries.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 120,
    });

    const content = resp.choices[0]?.message?.content || '';
    return content.trim();
  }
}

