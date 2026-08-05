import { StoryBoredClient } from '../../../../../../packages/storybored-sdk/dist/client.js';
import type {
  StoryBoredFeedbackRequest,
  StoryBoredFeedbackResponse,
  StoryBoredOwnedLibrary,
  StoryBoredOwnedLibraryContent,
  StoryBoredOwnedLibraryScenePack,
  StoryBoredPassage,
  StoryBoredSceneGeneration,
} from './types';

const STORYBORED_ENABLED_FLAG = process.env['NEXT_PUBLIC_STORYBORED_ENABLED'];
const STORYBORED_API_BASE_URL = process.env['NEXT_PUBLIC_STORYBORED_API_BASE_URL'];
const DEFAULT_LOCAL_API_BASE_URL = 'https://api.storybored.localhost';

function getStoryBoredApiBaseUrl(): string {
  if (STORYBORED_API_BASE_URL) return STORYBORED_API_BASE_URL.replace(/\/$/, '');
  return process.env.NODE_ENV === 'development' ? DEFAULT_LOCAL_API_BASE_URL : '';
}

export function isStoryBoredReaderEnabled(): boolean {
  if (STORYBORED_ENABLED_FLAG === 'false') return false;
  return getStoryBoredApiBaseUrl().length > 0;
}

interface StoryBoredReaderClientOptions {
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export class StoryBoredReaderClient {
  readonly #accessToken?: string;
  readonly #baseUrl: string;
  readonly #sdk: StoryBoredClient;

  constructor(options: StoryBoredReaderClientOptions = {}) {
    this.#accessToken = options.accessToken?.trim() || undefined;
    this.#baseUrl = getStoryBoredApiBaseUrl();
    this.#sdk = new StoryBoredClient({
      baseUrl: this.#baseUrl,
      ...(this.#accessToken ? { accessToken: this.#accessToken } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  async createSceneGeneration(input: StoryBoredPassage): Promise<StoryBoredSceneGeneration> {
    this.#assertProtectedRequestReady();

    return await this.#sdk.createSceneGeneration({
      bookId: input.bookId,
      selectedText: input.selectedText,
      surroundingContext: input.surroundingContext,
      chapter: input.chapter,
      location: input.location,
      stylePreset: input.stylePreset,
      userPromptOverride: input.userPromptOverride,
    });
  }

  async getSceneGeneration(id: string): Promise<StoryBoredSceneGeneration> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.getSceneGeneration(id);
  }

  async listBookSceneGenerations(bookId: string): Promise<StoryBoredSceneGeneration[]> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.listBookSceneGenerations(bookId);
  }

  async cancelSceneGeneration(id: string): Promise<StoryBoredSceneGeneration> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.cancelSceneGeneration(id);
  }

  async retrySceneGeneration(id: string): Promise<StoryBoredSceneGeneration> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.retrySceneGeneration(id);
  }

  async submitFeedback(
    id: string,
    feedback: StoryBoredFeedbackRequest,
  ): Promise<StoryBoredFeedbackResponse> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.submitSceneGenerationFeedback(id, feedback);
  }

  async listOwnedLibrary(): Promise<StoryBoredOwnedLibrary> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.listOwnedLibrary();
  }

  async getOwnedLibraryContent(libraryItemId: string): Promise<StoryBoredOwnedLibraryContent> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.getOwnedLibraryContent(libraryItemId);
  }

  async getOwnedLibraryScenePack(libraryItemId: string): Promise<StoryBoredOwnedLibraryScenePack> {
    this.#assertProtectedRequestReady();
    return await this.#sdk.getOwnedLibraryScenePack(libraryItemId);
  }

  #assertProtectedRequestReady(): void {
    if (!this.#baseUrl) {
      throw new Error('StoryBored API is not configured.');
    }
    if (!this.#accessToken) {
      throw new Error('StoryBored authentication is required.');
    }
  }
}

export function createStoryBoredReaderClient(
  options: StoryBoredReaderClientOptions = {},
): StoryBoredReaderClient {
  return new StoryBoredReaderClient(options);
}
