# Plugin Package Source Architecture

**Status:** Architectural direction for future implementation under issue #7  
**Date:** 2026-07-05  
**Related issue:** #7 (Plugin package/version management)  
**Related parent:** #6  
**Deferred from:** SDK Stage 3

## Overview

For the first practical plugin marketplace, DevHolm will use a **Git repository as a catalog**. This document establishes the architectural constraints and design patterns for implementation under issue #7. **This work is explicitly deferred from SDK Stage 3.**

## Catalog structure

- The catalog may be a single repository containing multiple plugin directories.
- Each top-level plugin directory represents one independently versioned plugin.
- Each plugin directory must be self-contained and include:
  - Manifest (package.json or equivalent)
  - Package assets (compiled code, configuration)
  - Migrations (database, schema changes)
  - Documentation
  - Compatibility metadata
  - Checksums or integrity metadata
  - Available release/version information

## Core responsibilities

DevHolm must be able to:

1. Inspect a repository catalog and enumerate available plugins
2. Retrieve a selected plugin at a specific version
3. Verify the plugin (integrity, signatures, compatibility)
4. Pass the plugin into the normal install/update pipeline

## Authority and state management

- The **catalog repository** is a source of plugin packages only, not an installed-version database or runtime registry.
- **Installed versions, pins, compatibility decisions, provenance, and rollback state remain site-local and authoritative.**
- No installed-state information should be written back to or depend on the catalog repository.

## Abstraction and extensibility

- The package-source architecture must use an abstraction such as `PluginPackageSource` or equivalent rather than hard-coding one GitHub repository.
- Initial supported sources may include:
  - Bundled packages (built into DevHolm)
  - Local directories or archives
  - Git catalog repositories
- A future hosted marketplace with search, discovery, ratings, publisher accounts, licensing, and a web interface must be able to publish the same underlying package format without forcing a redesign of installation, versioning, validation, or rollback.

## Future marketplace considerations

- **Marketplace web-service development is deferred** until the Git-catalog package flow and complete plugin-management system are proven.
- The package format, validation, and installation logic established during Git-catalog work must remain compatible with a future marketplace without major refactors.

## Relationship to SDK Stage 3

SDK Stage 3 focuses on **canonical authorization and server enforcement**. It does not implement plugin package management or marketplace infrastructure. Any minimal interface boundary required by Stage 3 (e.g., to distinguish plugin-owned vs site-owned evaluators) will be established as part of Stage 3's capability-scoped service design, but the full package-source abstraction and catalog logic remain issue #7 work.
