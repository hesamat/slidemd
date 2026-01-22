layout: title-slide
align: center
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Welcome to COMP 7855. Frame Agile as engineering coordination under uncertainty. -->

@title
# Agile & Scrum
## COMP 7855 — Week 1
### Hesam Alizadeh

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Anchor in student experience: failure modes are coordination, not syntax. -->

@header
# What usually goes wrong in group projects?

@main

> **💬 Miscommunication**
> - Assumptions about other work.
> - Silent requirement drift. 
> - Lost context in messages.

> **❓ Unclear ownership**
> - Who owns what? Duplicatework or gaps.
> - Finger-pointing when things break.

@media

> **⏰ Last-minute rush**
> - Integration left to the end.
> - No time to fix conflicts.
> - Panic-driven development

> **💻 “Works on my machine”**
> - Divergent environments
> - Missing dependencies.

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Methodology = coordination technology. -->

@header
# Why Methodology Exists
<br>
<h2 style="text-align:center"> Methodology = risk management </h2>

@main

<h2>❌ Not</h2>

- **Bureaucracy**: Red tape for its own sake
- **Busywork**: Meaningless forms and reports
- **Process theater**: Looking organized without beingorganized

@media

<h2>✅ But</h2> 

- **Making assumptions visible**: What are weassuming?
- **Making responsibility clear**: Who owns what?
- **Reducing surprises**: Early warning system forproblems

---

layout: header-two-column
<!-- background: linear-gradient(135deg, #fff7ed 0%, #fef9c3 100%) -->

<!-- notes: Works when change is low; breaks when change is high. -->

@header
# The Old Model: Waterfall
## Optimized for predictability, not change

@main

- Sequential: Requirements → Design → Code → Test.
- Assumes **stable requirements** up front.
- Testing happens last; late fixes are expensive.

@media

![Waterfall staircase diagram showing a crash at the testing phase](images/waterfall.png)

@footer

[Waterfall model (Hello PM)](https://hellopm.co/what-is-the-waterfall-model/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Feedback loop, not speed for speed's sake. -->

@header
# Agile as a Control System
## Adapt faster than uncertainty grows

@main

- Shorten the **sense → decide → act** loop.
- Build small, measure, adjust, repeat.
- Two-week cycles beat six-month guesses.

@media

![Circular diagram showing Build, Measure, Learn loop](images/build-measure-learn.png)

@footer

[Lean Startup: Build-Measure-Learn](https://en.wikipedia.org/wiki/Lean_startup)

---

layout: header-content
<!-- background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%) -->

<!-- notes: Value trade-offs; left matters more, right still matters. -->

@header
# The Agile Manifesto
## Value the left more than the right

@main

![](images/manifesto.png)

@footer
[The Agile Manifesto](https://agilemanifesto.org/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)

<!-- notes: Philosophy vs. framework. -->

@header
# Agile vs. Scrum
## Philosophy vs. Framework

@main

> **Agile (Why)**
> - Values & principles for adaptability.
> - Mindset: learn fast, adapt fast.
> - No specific rulebook.

@media

> **Scrum (How)**
> - Concrete rules: Roles, Events, Artifacts.
> - A process OS for teams.
> - Gives structure to be Agile.

@footer

[Agile vs Scrum (Atlassian)](https://www.atlassian.com/agile/agile-vs-scrum)

---

layout: header-content

@header
# Agile History I

@main

![](images/agilehistory-11.png)

@footer

[A brief history of Agile](https://awarenessagents.wordpress.com/2018/07/11/a-brief-history-of-agile/)

---

layout: header-content

@header
# Agile History II

@main

![](images/agilehistory21.png)

@footer

[A brief history of Agile](https://awarenessagents.wordpress.com/2018/07/11/a-brief-history-of-agile/)

---

layout: header-content
background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)

@header
# Scrum Values

@main

![Diagram showing Scrum as a lightweight framework for adapting under change](images/principles-and-values-of-scrum.png)

@footer
[Scrum Values (scrum.org)](https://www.scrum.org/resources/what-scrum-module)

---

layout: header-content
background: linear-gradient(135deg, #f1f5f9 0%, #e0f2fe 100%)

<!-- notes: Backlog -> Sprint Planning -> Work -> Review -> Retro. -->

@header
# Scrum Framework
@main

![Diagram of Backlog, Sprint Planning, Daily Scrum, Review, and Retro](images/scrum.png)

@footer
[Breaking down the Agile framework (Atlassian)](https://www.atlassian.com/agile/scrum)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)

<!-- notes: Roles are hats; value, process, implementation. -->

@header
# The Three Roles
## Hats you wear, not titles you hold

@main

> **🎯 Product Owner** 
> - Defines **WHAT**
> - Maximizes value
> - Owns the backlog.

> **🛡️ Scrum Master**
> - Protects **PROCESS**
> - Removes blockers
> - Coaches the team.

@media

> **⚙️ Developers** 
> - Build **HOW**
> - Self-organize
> - Own quality and implementation.

@footer

[Roles in Scrum (Agile Academy)](https://www.agile-academy.com/en/foundations/roles-in-scrum/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Artifacts are transparency mechanisms. -->

@header
# Scrum Artifacts
## Make work visible

@main

> **📜 Product Backlog** — Master list of everything desired; ordered by value.

> **📌 Sprint Backlog** — The slice for **this** sprint plus the delivery plan.

@media

> **🎁 Increment** — Usable software meeting the **Definition of Done**.

@footer

[Scrum Artifacts (Visual Paradigm)](https://www.visual-paradigm.com/scrum/what-are-scrum-artifacts/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Timeboxes protect build time; Daily is for the team. -->

@header
# Events: Planning & Syncing
## Plan together, sync briefly

@main

> **📅 Sprint Planning**
> - When: Start of sprint
> - Goal: Select work & design approach
> - Output: Sprint Goal + Sprint Backlog

@media

> **⏱️ Daily Scrum**
> - When: Daily, 15 mins max
> - Goal: Are we on track for the Sprint Goal?
> - Not: A status report to the boss

@footer

[Scrum Ceremonies & Artifacts](https://geekbot.com/blog/scrum-ceremonies-and-artifacts-what-wasnt-in-the-scrum-guide/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)

<!-- notes: Review = product; Retro = process. -->

@header
# Events: Reviewing & Improving
## Inspect the product; inspect the process

@main

> **🔎 Sprint Review**
> - Focus: The Product
> - Action: Demo to stakeholders
> - Goal: Feedback & adaptation

@media

> **🔄 Retrospective**
> - Focus: The Process
> - Action: What went well / poorly?
> - Goal: Concrete improvement experiments

@footer

[Scrum Ceremonies & Artifacts](https://geekbot.com/blog/scrum-ceremonies-and-artifacts-what-wasnt-in-the-scrum-guide/)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Done means shippable; merge, test, review. -->

@header
# The Definition of Done (DoD)
## If it isn’t shippable, it isn’t done

@main

> **Typical Student “Done”**
> - It compiles.
> - It runs on my laptop.
> - Comments later.

@media

> **Engineering “Done”**
> - ✅ Committed & **pushed**
> - ✅ Tests **passed**
> - ✅ Code **reviewed**
> - ✅ No critical bugs

@footer

[Definition of Done (Teaching Agile)](https://teachingagile.com/scrum/psm-1/scrum-implementation/definition-of-done)

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

<!-- notes: Connect to their data; bridge the gap. -->

@header
# What Your Survey Revealed
## Your starting point

@main

> **Skill Gap**
> - ~80% used Git.
> - ~70% rely on manual testing.
> - ~30% have formal QA experience.

@media

> **Top Pain Points**
> - Communication breakdowns.
> - Code that doesn’t fit together.
> - Integration failures.

---

layout: header-content
background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)

<!-- notes: Requirements will change; peers’ code; uncertainty. -->

@header
# Why Agile Fits This Course
## Built for change, not certainty

@main

- Requirements **will change** mid-project.
- You will integrate code you didn’t write.
- Things will break what “worked on my machine”.
- Decisions happen with incomplete information.

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)

<!-- notes: Discipline + adaptability. -->

@header
# The Agile Mindset
## Discipline enables speed

@main

> **❌ Bad Agile**
> - “We don’t plan; we just code.”
> - “No documentation ever.”
> - Whiplash pivots every hour.

@media

> **✅ Good Agile**
> - Continuous, adaptive planning.
> - Just-enough documentation.
> - Finish small slices, inspect, adjust.

---

layout: header-content
background: linear-gradient(135deg, #e0f2fe 0%, #f8fafc 100%)
align: center

<!-- notes: Close with actionable next steps. -->

@header
# Next Steps
## Make it real this week

@main

- Form your groups; agree on a working agreement.
- Create your Sprint board and initial backlog.
- Next lecture: Object Oriented Design.
- Next lab: Build the board; start Sprint 1 planning.
