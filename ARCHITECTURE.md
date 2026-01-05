# Architecture

## Entry Point Flow

```mermaid
flowchart TD
    START[bun run dev] --> PARSE[parseArgs]
    PARSE --> CHECK{interactive?}

    CHECK -->|yes| TUI[Render TUI App]
    CHECK -->|no| VALIDATE[validateNonInteractiveOptions]

    VALIDATE -->|errors| EXIT_ERR[Exit with errors]
    VALIDATE -->|ok| RUNNER[runNonInteractive]

    RUNNER --> INFO{info command?}
    INFO -->|--list-locations| LIST_LOC[listLocations]
    INFO -->|--list-types| LIST_TYPES[listTypes]
    INFO -->|no| PROVISION[provision]
```

## TUI Wizard Flow

```mermaid
stateDiagram-v2
    [*] --> Welcome

    Welcome --> HetznerSetup: Enter

    HetznerSetup --> CheckConfig: mount
    CheckConfig --> FoundToken: token exists
    CheckConfig --> InputToken: no token

    FoundToken --> ValidateToken: use existing
    FoundToken --> InputToken: enter new
    InputToken --> ValidateToken: submit

    ValidateToken --> SavePrompt: valid
    ValidateToken --> InputToken: invalid
    SavePrompt --> ServerCreate: continue

    HetznerSetup --> Welcome: Escape

    ServerCreate --> LoadData: mount
    LoadData --> EnterName: ready
    EnterName --> SelectLocation: submit
    SelectLocation --> SelectType: select
    SelectType --> Creating: select
    Creating --> KamalInit: success
    Creating --> Error: failure

    ServerCreate --> HetznerSetup: Escape

    KamalInit --> EnterProject: mount
    EnterProject --> EnterRepo: submit
    EnterRepo --> Initializing: submit
    Initializing --> Complete: success

    KamalInit --> ServerCreate: Escape

    Complete --> [*]: Ctrl+C
```

## Non-Interactive Provisioning Flow

```mermaid
flowchart TD
    START[runNonInteractive] --> MODE{mode?}

    MODE -->|dry-run| MOCK[Use mockHetzner]
    MODE -->|dev| REAL_DEV[Use realHetzner + initCleanup]
    MODE -->|production| REAL[Use realHetzner]

    MOCK --> VALIDATE_TOKEN
    REAL_DEV --> VALIDATE_TOKEN
    REAL --> VALIDATE_TOKEN

    VALIDATE_TOKEN[Validate Token] -->|invalid| FAIL[Exit 1]
    VALIDATE_TOKEN -->|valid| CREATE[Create Server]

    CREATE -->|error| FAIL
    CREATE -->|success| TRACK{dev mode?}

    TRACK -->|yes| TRACK_SERVER[trackServer]
    TRACK -->|no| CHECK_KAMAL
    TRACK_SERVER --> CHECK_KAMAL

    CHECK_KAMAL{project & repo?}
    CHECK_KAMAL -->|yes| WAIT[Wait for server]
    CHECK_KAMAL -->|no| DONE[Done]

    WAIT --> INIT_KAMAL[Initialize Kamal]
    INIT_KAMAL --> DONE

    DONE --> DEV_CHECK{dev mode?}
    DEV_CHECK -->|yes| WAIT_EXIT[Wait for Ctrl+C]
    DEV_CHECK -->|no| EXIT[Exit 0]

    WAIT_EXIT -->|SIGINT| CLEANUP[runCleanup]
    CLEANUP --> EXIT
```

## Hetzner Client Architecture

```mermaid
flowchart LR
    subgraph Components
        APP[App.tsx]
        HSETUP[HetznerSetup]
        SCREATE[ServerCreate]
    end

    subgraph Context
        PROVIDER[HetznerProvider]
        HOOK[useHetzner]
    end

    subgraph Clients
        REAL[hetzner.ts]
        MOCK[hetzner-mock.ts]
    end

    APP -->|mode prop| PROVIDER
    PROVIDER -->|provides client| HOOK

    HSETUP --> HOOK
    SCREATE --> HOOK

    HOOK -->|dry-run| MOCK
    HOOK -->|prod/dev| REAL

    REAL --> API[Hetzner API]
    MOCK --> FAKE[Fake responses]
```

## Dev Mode Cleanup Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Cleanup
    participant Hetzner
    participant TmpFile as /tmp/ship-it-cleanup.json

    User->>App: Start with --dev
    App->>Cleanup: initCleanup(token)
    Cleanup->>TmpFile: Check for orphaned servers

    alt Orphaned servers exist
        Cleanup->>Hetzner: DELETE /servers/:id
        Cleanup->>TmpFile: Clear file
    end

    App->>Hetzner: Create server
    Hetzner-->>App: Server ID
    App->>Cleanup: trackServer(id)
    Cleanup->>TmpFile: Persist server ID

    User->>App: Ctrl+C (SIGINT)
    App->>Cleanup: runCleanup()
    Cleanup->>Hetzner: DELETE /servers/:id
    Cleanup->>TmpFile: Clear file
    Cleanup-->>App: Done
    App-->>User: Exit 0
```

## Full Deploy Orchestration (deploy.ts)

```mermaid
flowchart TD
    START[fullDeploy] --> DETECT[Detect Project Type]
    DETECT --> SSH_KEY[Generate SSH Key Locally]
    SSH_KEY --> HETZNER_KEY[Upload Key to Hetzner]
    HETZNER_KEY --> FIREWALL[Create/Get Firewall]
    FIREWALL --> SERVER[Create Server with SSH Key]
    SERVER --> APPLY_FW[Apply Firewall to Server]
    APPLY_FW --> WAIT[Wait for Server Running]
    WAIT --> SSH_WAIT[Wait for SSH Available]

    SSH_WAIT --> SETUP_SERVER[Setup Server]
    subgraph Server Setup
        SETUP_SERVER --> APT[apt-get update/upgrade]
        APT --> DOCKER[Install Docker]
        DOCKER --> DEPS[Install git, curl]
        DEPS --> DIRS[Create /opt/app directory]
    end

    DIRS --> DOCKERFILE{Has Dockerfile?}
    DOCKERFILE -->|no| GEN_DOCKER[Generate Dockerfile]
    DOCKERFILE -->|yes| DEPLOY_YML
    GEN_DOCKER --> DEPLOY_YML[Generate deploy.yml]
    DEPLOY_YML --> SECRETS[Generate .kamal/secrets from .env]
    SECRETS --> KAMAL_CHECK{Kamal installed?}
    KAMAL_CHECK -->|no| ERROR[Error: Install kamal]
    KAMAL_CHECK -->|yes| KAMAL_SETUP[kamal setup]
    KAMAL_SETUP --> DONE[Deployed!]
```

## Project Detection Flow

```mermaid
flowchart TD
    START[detectProject] --> DOCKERFILE{Dockerfile exists?}
    DOCKERFILE -->|yes| HAS_DOCKER[hasDockerfile = true]
    DOCKERFILE -->|no| NO_DOCKER[hasDockerfile = false]

    HAS_DOCKER --> GEMFILE
    NO_DOCKER --> GEMFILE

    GEMFILE{Gemfile with rails?}
    GEMFILE -->|yes| RAILS[type = rails, port = 3000]
    GEMFILE -->|no| BUN_CHECK

    BUN_CHECK{bun.lockb exists?}
    BUN_CHECK -->|yes| BUN[type = bun, port = 3000]
    BUN_CHECK -->|no| NODE_CHECK

    NODE_CHECK{package.json exists?}
    NODE_CHECK -->|yes| NODE[type = node, port = 3000]
    NODE_CHECK -->|no| GENERIC[type = generic, port = 3000]

    RAILS --> DONE[Return ProjectInfo]
    BUN --> DONE
    NODE --> DONE
    GENERIC --> DONE
```

## SSH Key Flow

```mermaid
sequenceDiagram
    participant Ship as ship-it
    participant Local as ~/.config/ship-it/keys/
    participant Hetzner as Hetzner API
    participant Server

    Ship->>Local: generateSSHKey(name)
    alt Key exists
        Local-->>Ship: Return existing key
    else Key doesn't exist
        Ship->>Local: ssh-keygen -t ed25519
        Local-->>Ship: Return new key pair
    end

    Ship->>Hetzner: ensureSSHKey(name, publicKey)
    alt Key exists in Hetzner
        Hetzner-->>Ship: Return existing
    else Key doesn't exist
        Hetzner->>Hetzner: Create SSH key
        Hetzner-->>Ship: Return new key
    end

    Ship->>Hetzner: createServer with ssh_keys=[name]
    Hetzner->>Server: Provision with public key

    Ship->>Server: SSH using private key
    Server-->>Ship: Connected!
```

## File Dependencies

```mermaid
flowchart BT
    subgraph Entry
        INDEX[index.tsx]
    end

    subgraph TUI
        APP[App.tsx]
        WELCOME[Welcome.tsx]
        HSETUP[HetznerSetup.tsx]
        SCREATE[ServerCreate.tsx]
        KINIT[KamalInit.tsx]
        COMPLETE[Complete.tsx]
    end

    subgraph Lib
        CLI[cli.ts]
        RUNNER[runner.ts]
        CONFIG[config.ts]
        CLEANUP[cleanup.ts]
        HETZNER[hetzner.ts]
        HETZNER_MOCK[hetzner-mock.ts]
        HETZNER_CTX[hetzner-context.tsx]
        SSH[ssh.ts]
        PROJECT[project.ts]
        KAMAL[kamal.ts]
        DEPLOY[deploy.ts]
    end

    INDEX --> APP
    INDEX --> CLI
    INDEX --> RUNNER

    APP --> WELCOME
    APP --> HSETUP
    APP --> SCREATE
    APP --> KINIT
    APP --> COMPLETE
    APP --> HETZNER_CTX
    APP --> CLEANUP

    HSETUP --> HETZNER_CTX
    HSETUP --> CONFIG
    SCREATE --> HETZNER_CTX
    KINIT --> KAMAL

    HETZNER_CTX --> HETZNER
    HETZNER_CTX --> HETZNER_MOCK

    RUNNER --> HETZNER
    RUNNER --> HETZNER_MOCK
    RUNNER --> CONFIG
    RUNNER --> CLEANUP
    RUNNER --> KAMAL

    DEPLOY --> SSH
    DEPLOY --> HETZNER
    DEPLOY --> KAMAL
    DEPLOY --> PROJECT

    KAMAL --> SSH
    PROJECT --> |generates| DOCKERFILE[Dockerfile]
    PROJECT --> |generates| DEPLOY_YML[deploy.yml]
    PROJECT --> |generates| SECRETS[.kamal/secrets]
```
