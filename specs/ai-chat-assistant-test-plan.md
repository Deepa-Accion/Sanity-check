# Breeze.AI Chat Assistant Test Plan

## Application Overview

Test the authenticated Breeze.AI project chat assistant. The assistant lets users submit natural-language ontology questions, use predefined examples, select standard or experimental query modes, enable deep analysis, manage chat threads, and interact with generated responses through copy and Jira-ticket actions.

## Test Scenarios

### 1. AI Chat Assistant Core Flows

**Seed:** `tests/seed.spec.ts`

#### 1.1. Submit a predefined functional ontology query

**File:** `tests/ai-chat-assistant/predefined-functional-query.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session and open an existing project dashboard.
    - expect: The project dashboard loads with the AI Chat Assistant entry point visible.
  2. Open AI Chat Assistant.
    - expect: The chat page loads with the assistant heading, predefined prompt cards, message textbox, query-mode selector, deep-analysis switch, and Send message button.
  3. Click the Functional Ontology prompt card.
    - expect: The prompt text is populated in the message textbox and is ready to send.
  4. Click Send message.
    - expect: The user message appears in the chat log with a timestamp; a loading state is shown while processing; the assistant response eventually renders.
  5. Inspect the completed response.
    - expect: The response contains readable structured content such as text and/or a table, and response actions including Copy to clipboard and Raise a Jira ticket from this conversation are available.

#### 1.2. Submit a free-form query with Enter

**File:** `tests/ai-chat-assistant/free-form-enter.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page.
    - expect: The empty Ask me anything... textbox is visible.
  2. Type: Which services does the Dashboard depend on?
    - expect: The exact query appears in the textbox.
  3. Press Enter.
    - expect: The message is submitted once, the textbox is cleared or reset for the next message, and the user query appears in the chat log.
  4. Wait for processing to complete.
    - expect: A non-empty assistant response is rendered without an unhandled error.

#### 1.3. Reject empty or whitespace-only messages

**File:** `tests/ai-chat-assistant/empty-message-validation.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page.
    - expect: The message textbox is empty.
  2. Click Send message without entering text.
    - expect: No empty user message is added and no assistant request is submitted.
  3. Enter spaces only and click Send message.
    - expect: Whitespace-only input is rejected or ignored, with no empty chat message created and no unhandled error.

#### 1.4. Preserve multiline input with Shift+Enter

**File:** `tests/ai-chat-assistant/multiline-input.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page.
    - expect: The message textbox is available.
  2. Type the first line: Trace the login flow.
    - expect: The first line appears in the textbox.
  3. Press Shift+Enter, then type the second line: Include frontend and backend dependencies.
    - expect: A newline is inserted and both lines remain in the textbox.
  4. Submit the message.
    - expect: The complete multiline prompt is sent as one user message and the assistant begins processing it.

#### 1.5. Exercise query modes and deep analysis

**File:** `tests/ai-chat-assistant/query-modes.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page.
    - expect: The query-mode selector defaults to General Query and Deep analysis is off.
  2. Open the query-mode selector.
    - expect: General Query and General Query v2 Experimental are available options with their descriptions.
  3. Select General Query v2 Experimental.
    - expect: The selector displays General Query v2.
  4. Enable Deep analysis.
    - expect: The switch changes to on and remains visibly associated with the experimental label.
  5. Submit a valid query.
    - expect: The request uses the selected mode and deep-analysis setting, the chat displays the submitted prompt, and a response or clear service error is rendered.
  6. Start a new fresh chat and verify defaults.
    - expect: A new chat does not inherit stale input, and the mode/toggle state follows the documented product default.

#### 1.6. Create and switch chat threads

**File:** `tests/ai-chat-assistant/chat-threads.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page and open the chat thread panel if collapsed.
    - expect: The Chats panel and New chat control are visible.
  2. Submit a valid query and wait for its response.
    - expect: The current conversation is represented in the chat history/thread list.
  3. Click New chat.
    - expect: A new empty conversation opens, with no messages from the previous thread in the active log.
  4. Submit a different valid query.
    - expect: The second conversation receives its own user message and response.
  5. Switch back to the first thread.
    - expect: The first conversation's messages and response are restored without appearing in the second thread.

#### 1.7. Copy an assistant response

**File:** `tests/ai-chat-assistant/copy-response.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session and submit a query that produces a completed assistant response.
    - expect: The response and Copy to clipboard action are visible.
  2. Click Copy to clipboard.
    - expect: The complete response text is copied, a success indication is shown if supported, and the page remains usable.
  3. Paste the clipboard content into a local text field or inspect the clipboard through the test fixture.
    - expect: The clipboard content matches the assistant response text and does not contain unrelated UI labels.

#### 1.8. Raise a Jira ticket from a conversation

**File:** `tests/ai-chat-assistant/jira-ticket-action.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session and submit a query that produces a completed response.
    - expect: Raise a Jira ticket from this conversation is available.
  2. Click Raise a Jira ticket from this conversation.
    - expect: A Jira creation dialog, form, redirect, or explicit integration error appears.
  3. If a Jira form appears, inspect required fields and submit valid ticket details using test-safe data.
    - expect: The ticket is created or the UI reports the exact integration result without losing the source conversation.
  4. Dismiss or return from the Jira flow.
    - expect: The chat response and conversation remain available.

#### 1.9. Handle assistant service failure

**File:** `tests/ai-chat-assistant/service-error.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session on the project chat page.
    - expect: The chat input is usable.
  2. Intercept or stub the assistant request to return a server error or timeout.
    - expect: The test can deterministically simulate a failed assistant request.
  3. Submit a valid query.
    - expect: The UI shows a clear recoverable error state, the failed request does not create a misleading successful assistant response, and the page remains interactive.
  4. Correct the network condition and resend the same or a new query.
    - expect: A successful response can be received after recovery, without duplicate or corrupted messages.

#### 1.10. Preserve chat state across navigation and reload

**File:** `tests/ai-chat-assistant/state-persistence.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session, submit a valid query, and wait for the response.
    - expect: The completed conversation is visible.
  2. Navigate to the project dashboard and return to AI Chat Assistant.
    - expect: The expected thread and conversation state is restored according to product requirements.
  3. Reload the chat page.
    - expect: The page loads without an unhandled error, the selected project remains correct, and persisted messages or a documented fresh state are shown consistently.

#### 1.11. Prevent cross-project conversation leakage

**File:** `tests/ai-chat-assistant/project-isolation.spec.ts`

**Steps:**
  1. Start from a fresh authenticated session, open Project A chat, and submit a query.
    - expect: Project A shows its own conversation and response.
  2. Navigate to Project B and open AI Chat Assistant.
    - expect: Project B opens with its own thread context and does not show Project A messages.
  3. Submit a query in Project B.
    - expect: The response is associated with Project B and no Project A content is displayed in the active conversation.
