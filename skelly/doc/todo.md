# Todo

- [ ] Replace "Login with Microsoft" with the styling / logo that is normally shown for ms login.

- [ ] Add user roles

- [ ] add openapi endpoint maybe with tsoa and then use openapi fetch on the client

- [ ] level up to postgres or something more robust than sqlite

- [ ] identify and create common components in ui

- [ ] instead of showing available booking slots, show the number of bookings in the next 7 day period.

- [ ] generating library posts can take a while.  Let's add sse progress to the generating posts step on the post library page like we do for campaign planning

- [x] The back button on post details is hard-coded to /posts even if launched from library.  It should navigate back in the router to where-ever the page was launched from.

- [ ] image generation is being throttled.  If we get a 429, schedule the rest of the task for completion 1 minute later.

