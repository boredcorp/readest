import type {
  CreateSceneGenerationFeedbackRequest,
  CreateSceneGenerationRequest,
  SceneGenerationFeedbackResponse,
  SceneGenerationFeedbackCategory,
  SceneGenerationResponse,
  SceneGenerationStatus,
  SceneStylePreset,
} from '../../../../../../packages/types/dist/scene-generation.js';
import type {
  ListOwnedLibraryResponse,
  OwnedLibraryContentResponse,
  OwnedLibraryScenePackResponse,
} from '../../../../../../packages/types/dist/marketplace.js';
import type { InkBalanceResponse } from '../../../../../../packages/types/dist/ink.js';
import type {
  BillingCatalogItem,
  BillingCatalogItemKey,
  BillingCatalogResponse,
  BillingCheckoutStatus,
  BillingCheckoutStatusResponse,
  BillingInterval,
  CreateBillingCheckoutRequest,
  CreateBillingCheckoutResponse,
  CreateBillingPortalResponse,
  MeBillingResponse,
  StripeSubscriptionStatus,
} from '../../../../../../packages/types/dist/billing.js';

export type StoryBoredSceneStatus = SceneGenerationStatus;
export type StoryBoredStylePreset = SceneStylePreset;
export type StoryBoredSceneGeneration = SceneGenerationResponse;
export type StoryBoredFeedbackCategory = SceneGenerationFeedbackCategory;
export type StoryBoredFeedbackRequest = CreateSceneGenerationFeedbackRequest;
export type StoryBoredFeedbackResponse = SceneGenerationFeedbackResponse;
export type StoryBoredOwnedLibrary = ListOwnedLibraryResponse;
export type StoryBoredOwnedLibraryContent = OwnedLibraryContentResponse;
export type StoryBoredOwnedLibraryScenePack = OwnedLibraryScenePackResponse;
export type StoryBoredInkBalance = InkBalanceResponse;
export type StoryBoredBillingCatalogItem = BillingCatalogItem;
export type StoryBoredBillingCatalogItemKey = BillingCatalogItemKey;
export type StoryBoredBillingCatalogResponse = BillingCatalogResponse;
export type StoryBoredBillingCheckoutRequest = CreateBillingCheckoutRequest;
export type StoryBoredBillingCheckoutResponse = CreateBillingCheckoutResponse;
export type StoryBoredBillingPortalResponse = CreateBillingPortalResponse;
export type StoryBoredBillingCheckoutStatus = BillingCheckoutStatus;
export type StoryBoredBillingCheckoutStatusResponse = BillingCheckoutStatusResponse;
export type StoryBoredBillingInterval = BillingInterval;
export type StoryBoredMeBillingResponse = MeBillingResponse;
export type StoryBoredStripeSubscriptionStatus = StripeSubscriptionStatus;

export type StoryBoredPassage = Omit<CreateSceneGenerationRequest, 'stylePreset'> & {
  bookTitle?: string;
  stylePreset: StoryBoredStylePreset;
};
