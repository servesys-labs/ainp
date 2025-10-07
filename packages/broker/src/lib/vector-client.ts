/**
 * Vector Operations Client
 * Embedding generation and similarity search
 */

import OpenAI from 'openai';

export class VectorClient {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<string> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    const embedding = response.data[0].embedding;
    const float32 = new Float32Array(embedding);
    const bytes = new Uint8Array(float32.buffer);
    return Buffer.from(bytes).toString('base64');
  }

  /**
   * Generate embeddings in batch
   */
  async generateEmbeddings(texts: string[]): Promise<string[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    return response.data.map(({ embedding }) => {
      const float32 = new Float32Array(embedding);
      const bytes = new Uint8Array(float32.buffer);
      return Buffer.from(bytes).toString('base64');
    });
  }
}
