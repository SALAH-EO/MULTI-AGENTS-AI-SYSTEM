# 🤖 Multi-Agents AI System

> **A complete multi-agent AI platform built with n8n, Python, FastAPI, Next.js, and Docker — designed to orchestrate, monitor, and interact with multiple AI agents from a single interface.**

This project is a **multi-agent AI system** where AI agents are implemented and orchestrated primarily through **n8n workflows**, while a Python backend provides the application layer that connects the agent infrastructure with a web interface.

Instead of treating an AI agent as a single isolated chatbot, the platform provides an environment where **multiple specialized agents can operate as independent workflows**, be activated or deactivated, monitored, managed, and accessed through a centralized application.

The system combines:

* 🧠 **n8n** for AI-agent workflows and orchestration
* 🐍 **Python / FastAPI** for the backend and platform API
* ⚡ **Redis** for real-time communication and execution events
* 🍃 **MongoDB** for application data, users, and workflow-related information
* 🐘 **PostgreSQL** for n8n's persistent database
* 🔎 **Qdrant** for vector storage
* 🦙 **Ollama** for locally hosted LLMs and embeddings
* ⚛️ **Next.js** for the web interface
* 🐳 **Docker Compose** for running the entire infrastructure as a unified environment

The complete environment can be launched locally with Docker Compose, including n8n, databases, the AI runtime, backend, and frontend.

---

## 🧠 What Does This Project Do?

The main idea is to turn **n8n into an AI-agent orchestration layer** and place a custom application around it.

Each agent can be represented as an n8n workflow capable of receiving an input, processing it through AI models and tools, interacting with external services, and producing a result.

The platform then provides a centralized interface where users can:

* Discover available AI agents
* Interact with agents conversationally
* Manage agent workflows
* Activate or deactivate agents
* Monitor workflow executions
* Follow execution activity in real time
* View agent performance and execution history
* Manage users
* Control which users can access specific agents

The backend communicates directly with the n8n API to retrieve workflows and execution information and to control workflow activation/deactivation.

In other words, the project is not simply an **AI chatbot**.

It is an **AI-agent management and orchestration platform**.

---

# 🏗️ High-Level Architecture

The system can be understood as four major layers:

```text
                         ┌─────────────────────────┐
                         │        USER             │
                         │                         │
                         │  Chat / Dashboard /     │
                         │  Agent Management       │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │      NEXT.JS UI         │
                         │                         │
                         │  • Agent Chat           │
                         │  • Dashboard            │
                         │  • User Management      │
                         │  • Execution Monitoring │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     PYTHON BACKEND      │
                         │        FastAPI          │
                         │                         │
                         │ • Authentication        │
                         │ • Authorization         │
                         │ • User management       │
                         │ • Agent management      │
                         │ • n8n API integration   │
                         │ • Execution monitoring  │
                         └───────┬─────────┬───────┘
                                 │         │
                     ┌───────────┘         └────────────┐
                     ▼                                  ▼
            ┌─────────────────┐                ┌─────────────────┐
            │      n8n        │                │     Redis       │
            │                 │                │                 │
            │ AI Workflows    │◄──────────────►│ Real-time       │
            │ Agent Logic     │                │ Events / PubSub │
            │ Tools & APIs    │                └─────────────────┘
            └────────┬────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Ollama      External    Data /
      LLMs        Services    Vector DB
```

The Docker environment additionally provides PostgreSQL, MongoDB, Qdrant and Ollama as infrastructure services.

---

# 🤝 Multi-Agent Concept

The important architectural idea is **separation of responsibilities**.

Rather than building one enormous AI workflow that attempts to perform every task, the system can host multiple specialized agents.

For example:

```text
                    User Request
                         │
                         ▼
                ┌─────────────────┐
                │ Agent / Workflow │
                │     System       │
                └────────┬────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Agent A          Agent B        Agent C
   ┌──────────┐     ┌──────────┐    ┌──────────┐
   │ Research │     │ Business │    │ Support  │
   │   Agent  │     │   Agent  │    │   Agent  │
   └──────────┘     └──────────┘    └──────────┘
          │              │              │
          ▼              ▼              ▼
       Tools          APIs / DB       External
                                      Services
```

The advantage is that every agent can have its own:

* Prompt
* LLM
* Tools
* APIs
* Data sources
* Business logic
* Trigger
* Workflow
* Output format

This makes the architecture much easier to extend than a monolithic AI application.

Adding a new agent can essentially mean introducing another n8n workflow and making it available through the platform.

The repository includes a collection of n8n workflow backups that are automatically imported when the environment starts.

---

# 🔄 How the System Works

A typical interaction follows a flow similar to:

```text
1. User opens the platform
             │
             ▼
2. User authenticates
             │
             ▼
3. User selects an available agent
             │
             ▼
4. User sends a request
             │
             ▼
5. Frontend communicates with Python backend
             │
             ▼
6. Backend communicates with n8n
             │
             ▼
7. n8n executes the corresponding agent workflow
             │
             ▼
8. Agent performs its AI / automation tasks
             │
             ▼
9. Execution events are propagated through Redis
             │
             ▼
10. Backend receives execution information
             │
             ▼
11. Frontend displays the result / status
```

The Python backend is responsible for integrating the application with n8n rather than implementing all agent logic itself.

For example, the backend retrieves workflows from n8n and exposes application-level endpoints for workflow management, including activation, deactivation, retrieval and execution monitoring.

---

# ⚙️ n8n as the Agent Orchestration Layer

n8n is the core automation and workflow engine of the project.

Instead of hard-coding every AI interaction inside Python, the project uses n8n to visually construct and execute agent workflows.

This provides a flexible way to combine:

* LLM calls
* APIs
* Webhooks
* Data processing
* External applications
* Conditional logic
* Automation steps
* Vector search
* Custom Python logic
* Notifications
* Business processes

The Python backend communicates with n8n through its API using an API key.

The backend uses the n8n API to retrieve workflows and execution information and to control workflow state.

This separation creates a useful architecture:

**n8n = Agent execution and orchestration**

**Python = Platform/backend layer**

**Next.js = User interface**

---

# 📡 Real-Time Execution Monitoring

One of the important aspects of the platform is that it is not limited to sending a request and waiting for a final answer.

The backend integrates **Redis Pub/Sub** to handle execution-related events.

This allows the platform to follow workflow activity and propagate execution information to the frontend in real time.

Conceptually:

```text
              n8n Workflow
                   │
                   │ execution event
                   ▼
              Python Backend
                   │
                   ▼
                Redis
              Pub / Sub
                   │
                   ▼
              WebSocket
                   │
                   ▼
             Web Dashboard
```

This makes it possible to build monitoring interfaces where users can observe what is happening while agents are executing.

The backend contains explicit Redis integration and n8n workflow subscription/cleanup logic.

---

# 📊 Platform Capabilities

The platform is designed to provide more than simple agent conversations.

### 💬 Agent Interaction

Users can access conversational AI agents through the web application and interact with them from a centralized interface.

The original project architecture exposes an `/agents` area for interacting with conversational agents.

### 🔄 Workflow Management

The backend exposes functionality for interacting with n8n workflows, including:

* Listing workflows
* Retrieving individual workflows
* Activating workflows
* Deactivating workflows
* Updating workflows
* Retrieving workflow executions

This effectively turns the web application into a management layer on top of n8n.

### 📈 Execution Monitoring

The platform can retrieve and monitor workflow executions, making it possible to inspect what happened when an agent was triggered.

### 👥 User Management

The application contains authentication and authorization mechanisms based on:

* Password hashing
* JWT authentication
* User accounts
* Administrative privileges
* Agent/workflow access control

The backend uses JWT-based authentication and bcrypt password hashing.

### 🔐 Access Control

Administrators can control which users have access to specific agents.

This is particularly useful in an organization where different employees should have access to different AI capabilities.

For example:

```text
                    ADMIN
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       User A       User B       User C
          │           │           │
       Agent 1      Agent 1      Agent 3
       Agent 2      Agent 3      Agent 4
```

---

# 🧠 Local AI with Ollama

The architecture also includes **Ollama**, allowing locally hosted models to be used instead of relying exclusively on external LLM APIs.

The Docker configuration exposes Ollama on port `11434` and automatically pulls:

* `llama3.1`
* `nomic-embed-text`

The latter can be used for embedding/vector-search scenarios.

This provides an important option for experimenting with more private or locally executed AI workloads.

The system supports both CPU and NVIDIA GPU Ollama profiles through Docker Compose.

---

# 🗄️ Data & Infrastructure

The project combines several infrastructure components, each serving a different purpose.

| Component            | Purpose                                     |
| -------------------- | ------------------------------------------- |
| **n8n**              | AI-agent workflows and automation           |
| **FastAPI / Python** | Backend API and platform logic              |
| **Next.js**          | Web interface                               |
| **PostgreSQL**       | Persistent n8n database                     |
| **MongoDB**          | Application users and workflow-related data |
| **Redis**            | Real-time events and Pub/Sub                |
| **Qdrant**           | Vector database                             |
| **Ollama**           | Local LLM and embedding runtime             |
| **Docker Compose**   | Infrastructure orchestration                |

The repository's Compose configuration defines these services and connects them through a shared Docker network.

---

# 🛠️ Technology Stack

### AI & Automation

* n8n
* Ollama
* Llama 3.1
* `nomic-embed-text`
* LLM-based AI agents
* Workflow automation
* API integrations
* Vector search infrastructure

### Backend

* Python
* FastAPI
* Pydantic
* JWT
* bcrypt
* WebSockets
* Redis
* MongoDB
* REST APIs

### Frontend

* Next.js
* React
* JavaScript
* Web-based agent dashboard

### Infrastructure

* Docker
* Docker Compose
* PostgreSQL
* MongoDB
* Redis
* Qdrant
* Ollama

---

# 🚀 Run the Complete System Locally

The easiest way to experiment with the project is through Docker.

## Prerequisites

Install:

* [Docker](https://www.docker.com/)
* Docker Compose
* Git

A machine with sufficient RAM is recommended because the environment can run multiple databases, n8n, the web application and potentially local LLMs simultaneously.

If you want to use the GPU version of Ollama, an NVIDIA GPU with the appropriate Docker/NVIDIA runtime configuration is required.

---

## 1. Clone the Repository

```bash
git clone https://github.com/SALAH-EO/MULTI-AGENTS-AI-SYSTEM.git

cd MULTI-AGENTS-AI-SYSTEM
```

---

## 2. Configure Environment Variables

The system requires environment configuration for services such as:

* PostgreSQL
* n8n
* Google APIs
* Slack
* MongoDB
* Redis
* JWT authentication
* Encryption
* n8n API access

Create/configure the required `.env` values according to your environment.

At minimum, pay particular attention to:

```env
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

N8N_API_KEY=

GOOGLE_API_KEY=
GOOGLE_CSE_ID=

SLACK_BOT_TOKEN=
SLACK_TEAM_ID=

SHEET_ID=

JWT_SECRET_KEY=
AES_ENCRYPTION_KEY=

MONGO_CONNECTION_STRING=
MONGO_DB_NAME=
```

The backend expects the n8n API configuration and database configuration through environment variables.

**Do not commit real API keys, passwords, OAuth credentials or encryption keys to GitHub.**

---

# 🐳 3. Start the System

For CPU-based local AI:

```bash
docker compose --profile cpu up --build
```

For an NVIDIA GPU environment:

```bash
docker compose --profile gpu-nvidia up --build
```

The Compose configuration automatically starts the required infrastructure and imports the backed-up n8n workflows and credentials into the n8n instance.

---

# 🌐 4. Access the Platform

Once the containers are running, the main services are available at:

### Web Application

```text
http://localhost:3002
```

### n8n

```text
http://localhost:5678
```

### Backend API

```text
http://localhost:8000
```

The Docker configuration maps the backend to port `8000` and the Next.js application to port `3002`. n8n is exposed on port `5678`.

---

# 🔑 5. Configure n8n

Open:

```text
http://localhost:5678
```

If required by the current n8n setup, create the initial n8n account and configure the required credentials.

The system can integrate with external services such as:

* Google
* Slack
* Other APIs used by individual agent workflows

The Python backend expects an n8n API key to communicate with the n8n instance.

---

# 👤 6. Access the Application

Open:

```text
http://localhost:3002
```

The application provides the platform interface for:

* Authentication
* Agent access
* Conversational interaction
* Agent/workflow management
* Execution monitoring
* Administration

The original project documentation also identifies an administration interface and an agents interface for managing users and interacting with agents.

---

# 🔬 Trying an Agent

Once the environment is running:

```text
Browser
   │
   ▼
http://localhost:3002
   │
   ▼
Login
   │
   ▼
Agents
   │
   ▼
Select an available agent
   │
   ▼
Send a request
   │
   ▼
n8n executes the workflow
   │
   ▼
AI agent processes the request
   │
   ▼
Result returned to the platform
```

You can also open n8n directly:

```text
http://localhost:5678
```

and inspect the imported workflows to understand how the agents are constructed and orchestrated.

---

# 🧪 Experimenting With the System

The project is particularly useful as a foundation for experimenting with different types of AI agents.

You can create or adapt n8n workflows for use cases such as:

* Customer support
* Research assistants
* Data analysis
* Document processing
* Business automation
* Lead qualification
* Knowledge-base assistants
* Internal company assistants
* API-driven agents
* RAG systems
* Workflow automation
* Multi-step reasoning systems

For example, an organization could create:

```text
                  AI PLATFORM
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
  Support Agent   Research Agent   Data Agent
        │              │              │
        ▼              ▼              ▼
     Zendesk        Web/Search      Database
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                  Final Result
```

The important part is that the **orchestration layer is decoupled from the user-facing application**, making it possible to expand the platform with additional workflows and integrations.

---

# 🔐 Security Considerations

The platform includes several security-related mechanisms such as:

* JWT authentication
* Password hashing
* User authorization
* Agent access control
* Environment-based secrets
* Encrypted secret handling
* CORS configuration

However, this repository should be treated primarily as a **development / self-hosted platform** unless additional production hardening has been performed.

Before exposing the system publicly, you should review:

* Secret management
* JWT secret configuration
* CORS policies
* n8n authentication
* API authentication
* HTTPS/TLS
* Rate limiting
* Network exposure
* Docker security
* Database credentials
* User permissions

Never expose the default development configuration directly to the public internet.

---

# 🎯 Why This Architecture?

A conventional AI application might look like:

```text
Frontend → Backend → LLM
```

This project instead follows a more extensible architecture:

```text
Frontend
    ↓
Platform Backend
    ↓
n8n Agent Infrastructure
    ↓
Specialized AI Workflows
    ↓
LLMs / APIs / Databases / Tools
```

This separation has several advantages.

### 1. Visual Agent Development

Agents can be designed and modified through n8n workflows instead of implementing every orchestration step manually in Python.

### 2. Easy Integration

n8n provides a large ecosystem of integrations and workflow nodes, allowing agents to communicate with external systems.

### 3. Centralized Management

The custom platform provides a single interface for users, administrators, agents and execution monitoring.

### 4. Extensibility

New agents can be introduced as additional workflows without redesigning the entire platform.

### 5. Local AI Support

Ollama makes it possible to experiment with local LLMs rather than depending exclusively on cloud-based AI providers.

### 6. Real-Time Monitoring

Redis and WebSocket-based communication make it possible to provide live execution information to the frontend.


---

# 👨‍💻 Author

**Salah Eddine Ouirra**

Data Science & Big Data | AI Engineering | AI Agents | Automation

---

## ⭐ If You Find This Project Useful

Feel free to ⭐ star the repository, experiment with the agent architecture, and adapt the workflows to your own AI automation use cases.
