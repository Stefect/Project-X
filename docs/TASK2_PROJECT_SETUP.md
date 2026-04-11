# Task 2 Project Setup Guide

This project is structured as a practical Node.js plus Electron workspace with a reusable utility layer.

## Repository Initialization

- Single git repository with source, public assets, docs, and examples.
- Remote configured for collaborative push and branch-based workflow.

## Core Layout

- src contains application modules and reusable utilities.
- public contains renderer pages and static assets.
- examples contains runnable demo scripts for tasks.
- docs contains implementation notes and setup guides.

## Build and Run

- npm install
- npm run build:css
- npm start

## Why This Setup Is Practical

- Utilities are split into focused files and imported by app modules.
- Demo scripts in examples can be run independently to validate each task.
- Project can evolve from lab tasks into production-like browser features without restructuring.
