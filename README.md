# Revue

Revue is a study app for Filipino students preparing for classes and exams. Test yourself by answering from memory before checking the card.

**[Try Revue at revuetayo.com](https://revuetayo.com).** Choose **Browse sets**, pick a subject, then select **Try 5 cards**. You don't need an account.

## What you can do today

- Browse shared sets on Philippine History, Philippine Nature, and Weather & Disasters.
- Try five questions, check the answers and their sources, then rate each attempt.
- Share a set with classmates.

Practice isn't saved. The example schedule shows when cards could come back.

Revue is in early development. The current build also supports invitation-only pilot accounts. Saving sets, creating personal decks, and scheduling reviews from saved progress are planned.

## Help and feedback

For questions, card corrections, account help, or privacy requests, email [revuetayo@gmail.com](mailto:revuetayo@gmail.com). Requests are handled personally.

## Technical overview

Revue uses a React frontend and a Spring Boot backend with PostgreSQL. One application serves the web interface and API. The backend groups catalog, accounts, and review scheduling into separate modules.

## License and credits

All rights reserved. This repository has no open-source license.

Study cards credit their sources. The [Inter font license](frontend/public/fonts/inter-LICENSE.txt) is included. The Java style configuration is adapted from [Checkstyle's Google profile](https://checkstyle.org/google-style.html).
