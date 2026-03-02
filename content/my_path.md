---
title: "My Path"
description: "A detailed step-by-step guide to how Jimmy and Kevin built their campaign pages."
type: page
url: "/my-path/"
draft: false
---

## My Path: How Jimmy and Kevin Built Their Campaign Pages

This is the more detailed, step-by-step version of the process introduced on the Support page.

Jimmy Skovgard and Kevin Christensen built their campaign pages by making practical choices, keeping ownership with the candidate, and documenting the work so it could be repeated. This page captures the actual path in a more complete form.

We see this work as part of the basic duty of self-government: citizens building the tools they need to speak, organize, and lead in public.

We offer this as one real example, not as the only correct model. As candidates, volunteers, and organizers, we should treat this as a working path we can adapt, improve, and reshape to fit the needs of each campaign.

## What This Guide Is For

This guide shows how to launch a campaign website that is:

- Fast to build
- Easy to update
- Simple to maintain locally
- Straightforward to publish online
- Clean enough to hand off so new leaders can continue the work

We use Kevin as the example candidate in several places because it makes the process easier to explain. Replace Kevin with the real candidate name, domain, and campaign details for your own use.

## Why This Workflow Uses Codex

This workflow uses Codex, OpenAI’s coding agent, to help scaffold and maintain the site quickly. It can read and edit files, run commands, and help keep the workflow consistent from one campaign to the next.

In practice, this approach is much easier to sustain with a paid ChatGPT plan, because build and troubleshooting work tends to hit usage limits at the worst time. If we want to follow this exact path, we should budget for the tools required to maintain momentum.

## How To Use This Guide

Each step includes:

- A goal
- A deliverable
- Helpful prompts that can be pasted into ChatGPT or Codex

When a prompt says to paste output, the best practice is to paste the exact error message or command output. That gives the fastest path to a real fix.

## What We Are Building

As candidates, we are building a campaign website that:

- Lives on our own domain
- Is hosted on low-cost or free infrastructure
- Is version-controlled and easy to hand off
- Can be edited safely and previewed locally before publishing
- Can be reused as a starting point for future local campaigns

## What We Want Long-Term

Our goal is independence. We may begin with support, but the end state should be candidate ownership and durable local self-government.

That means:

- The candidate owns the domain, hosting, and repository
- We use a proven structure to move quickly
- We document the process so the next person can repeat it

## Step 1: Choose and Register a Domain Name

### Goal

As candidates, we choose a domain that is easy to say, easy to spell, and easy to put on a yard sign.

Examples:

- `christensen2026.org`
- `christensenforwyoming.org`
- `christensen2026.us`

### Where To Buy a Domain

We can use a registrar like Namecheap, or any registrar that allows nameserver changes and DNS control.

### Deliverable

- The domain is purchased in the candidate’s own registrar account
- Renewal is configured and recorded

### Helpful Prompts

**Prompt A: domain ideas and risk check**

- “Generate 15 domain name options for a Wyoming campaign for Kevin Christensen. Keep it short, easy to spell, and sign-friendly. Include .org and .us options.”

**Prompt B: spelling and clarity test**

- “Given the candidate name Kevin Christensen, which of these domains is least likely to be misspelled by a voter? Here are the options: [paste list]. Pick the top 3 and explain why.”

**Prompt C: registrar shopping checklist**

- “Create a simple checklist for buying a domain from Namecheap and ensuring we can change nameservers to Cloudflare.”

## Step 2: Create a Free Cloudflare Account for Hosting and DNS

### Goal

As candidates, we create the Cloudflare account that will host the site and manage DNS.

Cloudflare can handle:

- DNS
- Free SSL
- Hosting through Cloudflare Pages

### Deliverable

- The candidate has a free Cloudflare account
- The domain is added as a Cloudflare site (zone)

### Helpful Prompts

**Prompt A: account setup steps**

- “Write step-by-step instructions to create a free Cloudflare account, add a site, and prepare for nameserver changes.”

**Prompt B: access and ownership rules**

- “Draft a short policy for our campaign sites: who owns the Cloudflare account, how to use 2FA, and how to invite helpers with limited permissions.”

**Prompt C: troubleshoot onboarding**

- “Cloudflare onboarding is blocked at [describe screen or error]. Give the most likely causes and the next three actions.”

## Step 3: Point the Domain’s Nameservers to Cloudflare

### Goal

As candidates, we connect the domain registrar to Cloudflare so DNS and SSL work reliably.

### What Happens Here

Cloudflare provides two nameservers. We log into the registrar and replace the existing nameservers with the ones Cloudflare provides.

### Deliverable

- The domain shows “Active” in Cloudflare
- DNS is managed in Cloudflare

### Helpful Prompts

**Prompt A: exact nameserver change steps**

- “I bought a domain on Namecheap and I want to point it to Cloudflare. Give precise steps for changing nameservers and what confirmation to look for.”

**Prompt B: propagation expectations**

- “After changing nameservers, what should we check in Cloudflare to confirm it worked, and what is normal to see during DNS propagation?”

**Prompt C: fix common mistakes**

- “My domain still shows ‘Pending’ in Cloudflare after nameserver changes. List the top 7 causes and fixes in order.”

## Step 4: Create a GitHub Account and a New Repository

### Goal

As candidates, we create a GitHub repository that stores the website source code and powers automatic deploys.

### Deliverable

- The candidate has a GitHub account
- The candidate creates a repository such as `christensen2026`

### Helpful Prompts

**Prompt A: repo naming and settings**

- “Recommend a GitHub repo name and settings for a campaign site. Include public vs private recommendation and why.”

**Prompt B: security basics**

- “Create a checklist for GitHub security for a new campaign repo: 2FA, protected branches, who can merge, and how to handle secrets.”

**Prompt C: first commit plan**

- “Write the smallest sequence of steps to create a new GitHub repo, clone it locally, commit a README, and push.”

## Step 5: Choose a Development Setup

### Goal

As candidates, we set up a local environment so edits can be previewed before publishing.

### Recommended Setup

- Windows 11
- WSL (Windows Subsystem for Linux)
- Ubuntu inside WSL
- Visual Studio Code

### Deliverable

- WSL is installed
- Ubuntu is installed
- Git is installed in Ubuntu
- VS Code can open the project folder and use the WSL terminal

### Helpful Prompts

**Prompt A: WSL setup checklist**

- “Give a complete checklist to set up WSL + Ubuntu on Windows 11 for Hugo development, including Git and VS Code integration.”

**Prompt B: verify environment**

- “Give commands I can run in WSL to verify Ubuntu, git, and Hugo are correctly installed. Include expected outputs.”

**Prompt C: fix path and permission issues**

- “VS Code cannot access WSL files, or Git fails with permissions. Give the most common causes and exact fixes.”

## Step 6: Scaffold the Website From the Skovgard2026 Template

### Goal

As candidates, we move fast by copying a working structure and replacing only the identity-specific content.

### Core Idea

We keep the mechanics:

- Hugo structure and build commands
- Theme and layouts
- Security posture

We replace the identity layer:

- Name, bio, and photos
- Issues and priorities
- Contact and volunteer pages
- Branding such as colors, logo, and headings

### Deliverable

- The site runs locally
- The first commit exists in the candidate’s repository

### Helpful Prompts

**Prompt A: Codex scaffold prompt**

- “Codex, scaffold a new Hugo site repo from the public skovgard2026 template. Replace only identity content for Kevin Christensen and christensen2026.org. Keep layouts, theme, and security posture intact. Produce a file-change list and commands to run locally to validate.”

**Prompt B: content replacement map**

- “Given a Hugo campaign site, list the most likely files where branding lives (title, baseURL, menus, hero text, social links). Provide a search plan using ripgrep and exact commands.”

**Prompt C: broken build fix**

- “Hugo build failed with this error: [paste error]. Diagnose and propose a minimal fix. Provide exact file edits.”

**Prompt D: navigation and links audit**

- “Create a checklist to audit internal links, menus, and missing images after scaffolding. Include Hugo commands to spot broken links.”

## Step 7: Publish the Site With Cloudflare Pages

### Goal

As candidates, we connect GitHub to Cloudflare Pages so pushes publish automatically.

### Publishing Model

- We push changes to GitHub
- Cloudflare Pages builds and publishes automatically

### Deliverable

- A Pages project exists under the candidate’s Cloudflare account
- The GitHub repository is connected
- The site is live on a Pages preview URL

### Helpful Prompts

**Prompt A: Pages setup steps**

- “Give step-by-step instructions to create a Cloudflare Pages project from a GitHub repo and set the correct build settings for Hugo.”

**Prompt B: Hugo build settings**

- “What build command and output directory should Cloudflare Pages use for a Hugo site? Provide the exact values to paste into Pages settings.”

**Prompt C: diagnose a failed Pages build**

- “Cloudflare Pages build failed. Here is the build log: [paste log]. Identify the root cause and the minimal fix.”

## Step 8: Connect the Custom Domain to Cloudflare Pages

### Goal

As candidates, we serve the site at the real domain with HTTPS.

### Deliverable

- The site is live at the real domain, for example `https://christensen2026.org`
- HTTPS works
- Redirect behavior is correct

### Helpful Prompts

**Prompt A: domain attach steps**

- “Give exact steps to attach a custom domain to Cloudflare Pages and confirm HTTPS is enabled.”

**Prompt B: redirect policy**

- “Recommend a redirect policy for www vs apex domain for a campaign site. Provide steps to implement in Cloudflare.”

**Prompt C: SSL troubleshooting**

- “HTTPS is failing or showing a certificate warning on the domain. List causes and fixes in order.”

## Step 9: Document Everything So the Next Candidate Can Repeat It

### Goal

As candidates, we turn the build into a repeatable process that new candidates and volunteers can follow.

### Documentation Rules

- Keep steps short
- Keep commands copy-pasteable
- Record what worked and what broke
- Maintain a common fixes section

### Warning About AI Tools

A serious limitation of AI tools like ChatGPT and Codex is that they are session-specific. They do not reliably remember changes made to documents unless they are explicitly told to review those documents again, and even then they can still make mistakes.

We should use AI as an assistant, not as an authority. Exercise caution when creating with it. Review everything. Test everything. Treat every output as a draft until it has been checked by a real person.

### Deliverable

A `docs/` folder in the repository with:

- `00-overview.md`
- `01-domain-and-cloudflare.md`
- `02-github-and-repo.md`
- `03-local-dev-setup-windows-wsl.md`
- `04-scaffold-from-template.md`
- `05-deploy-with-pages.md`
- `06-common-fixes.md`
- `07-training-checklist.md`

### Helpful Prompts

**Prompt A: write docs from real actions**

- “Turn these notes into clean documentation with headings, numbered steps, and code blocks. Notes: [paste bullet notes].”

**Prompt B: create a training checklist**

- “Create a one-page training checklist that a new volunteer can follow to set up WSL, clone the repo, run the site locally, and publish a change.”

**Prompt C: capture troubleshooting patterns**

- “Based on these errors we hit: [paste errors], create a ‘Common Fixes’ section with cause, fix, and how to confirm.”

## Support and Handoff

We help launch the project, then we hand the controls back.

If a step blocks progress, we can help when time allows, but the standard stays the same:

- The candidate owns the keys
- We provide the ladder
- The candidate climbs it and teaches the next person

That is what makes the work sustainable.

## Call to Action

Thank you for taking a step on the path toward preserving self-government for our children and our children’s children.

Citizen by citizen, we rebuild the habits of a free people.

Take the citizen’s oath:

“I, [state your name], do hereby solemnly swear that I will support and defend the Constitution of the United States against all enemies, foreign and domestic; that I will bear true faith and allegiance to the same; and that I take this obligation freely, as a citizen committed to the duties of self-government.”

Build what you can. Teach what you learn. Help the next person step forward.
