PRODUCT REQUIREMENTS DOCUMENT (PRD)



##### **Product Name:**



###### ***Structura***



Tagline:

*AI gives answers. Structura gives structure.*



**1. Overview**



Structura is an AI-native knowledge refactoring tool that transforms linear LLM conversations into structured, explorable knowledge systems.



It converts raw chat logs into:

* Concepts
* Relationships
* Assumptions
* Open questions
* Action items



All derived from a strict JSON knowledge schema.



**2. Problem Statement**



LLM conversations are:

* Linear
* Ephemeral
* Hard to retrieve
* Structurally flat



Users often lose valuable insights inside long scroll-based chat sessions.



There is no system-level restructuring layer between:

Raw AI dialogue → Reusable structured knowledge



Structura solves this gap.



**3. Goals**



**Primary Goal**

* Enable users to convert any LLM conversation into a structured knowledge graph in under 10 seconds.



**Secondary Goals**

* Provide multiple views (Outline, Graph, Flashcards)
* Make output exportable and shareable
* Demonstrate AI-native structured transformation



**4. Non-Goals (MVP)**



**Not a note-taking app**

* No cloud sync
* No collaboration
* No authentication system
* No spaced repetition algorithm
* No full knowledge base management



Focus: Single-conversation restructuring.



**5. Target Users**



Primary

* Developers
* Analysts
* Researchers
* Systems thinkers
* Power learners



Secondary

* Students
* Knowledge workers using ChatGPT daily



**6. Core User Flow**



1. User pastes LLM conversation
2. Clicks “Structure”
3. System calls AI extraction endpoint
4. Receives structured JSON
5. Renders:

&nbsp;       -Outline View

&nbsp;       -Graph View

&nbsp;       -Flashcard View

6\. User can edit or export



**7. Functional Requirements**



7.1 Chat Import



* Accept raw text input
* Accept .txt or .md file upload
* Basic input validation (min length)



7.2 AI Structuring Engine



System must:

* Call OpenAI API
* Use strict JSON schema
* Validate output using Zod
* Retry/repair invalid JSON automatically



Must extract:

* title
* summary
* concepts (max 20)
* relationships (max 30)
* assumptions
* questions
* actions



7.3 Outline View



Display:

* Summary
* Collapsible sections
* Editable concept labels
* Editable descriptions



7.4 Graph View



Render:

* Nodes (concepts)
* Edges (relationships)
* Interactive selection
* Highlight connected nodes
* Tooltip with description



7.5 Flashcard View



Auto-generate from:

* Definitions
* Questions



Card UI:

* Flip animation
* Next / Previous
* Edit card



7.6 Export



* Download JSON
* Download Markdown
* Export graph as PNG



**8. Success Metric**



* % of successful JSON parses
* Time to structure
* User “wow moment” (qualitative)
* Demo shareability
