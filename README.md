# OpenEA - Enterprise Architecture Tool

OpenEA is a modern, high-density enterprise architecture tool designed for organizations to manage their application inventory, business capabilities, information model, and system integrations with a focus on visual health, compliance, and strategic alignment.

## ✨ What's New (Extended Metamodel)

We have recently expanded the core architecture to support a more rigorous Enterprise Architecture practice:

- **🔐 Information Model & CIA Triad:** Define conceptual business data objects with specialized **Confidentiality, Integrity, and Availability** (1-4) scoring and **PII Category** tracking.
- **🏢 Organization Units:** Map hierarchical accountability structures from top-level Divisions down to specific Teams and Roles.
- **🔌 Structured Integrations:** Move beyond freetext relations with a dedicated Integration artifact supporting multi-select **CRUD operations**, delivery patterns (REST, Event, Batch), and exchange frequencies.
- **⚙️ Artifact-Based Configuration:** A redesigned settings engine that groups picklists and dynamic metadata by artifact type for intuitive governance.
- **📍 Deep-Linking & Routing:** Transitioned to a fully route-based architecture, allowing you to share direct links to specific detail views or filtered diagrams.

## 🚀 Key Functionalities

### Application Inventory
- **High-Density Management:** Manage your software estate through visual grid cards or professional list views.
- **Advanced Filtering:** Instantly slice your inventory by Owner, Lifecycle Stage, Application Type, or health scores.
- **Metadata Support:** Define custom fields (Ranges, Strings, Dates) to match your organization's specific data needs.

### Business Capability Mapping
- **Hierarchical Mapping:** Define a recursive tree of business functions to represent your organizational structure.
- **Strategic Inheritance:** Applications automatically inherit the highest **Business Criticality** from the capabilities they support.
- **Recursive Discovery:** Filter diagrams by "Capability Area" to automatically include all applications within a specific business branch.

### Interactive Visualizations
- **Integration Network:** An intelligent "Island Layout" showing top-down data flows with rich labels for payloads and technical patterns.
- **Heat Map Overlays:** Switch between **Criticality**, **Functional Fit**, **Technical Fit**, and **CIA Risk** to visualize your architecture's health.
- **Unified Search:** A single powerful search bar (`⌘K`) that indexes App names, Descriptions, Payloads, and Roles.

## 🛠 Tech Stack

- **Frontend:** React 19 (TypeScript), Vite, [React Flow](https://reactflow.dev/), [Radix UI](https://www.radix-ui.com/), [TanStack Query](https://tanstack.com/query/latest).
- **Backend:** Node.js, [Fastify](https://www.fastify.io/), [Prisma 6](https://www.prisma.io/) (ORM), [Zod](https://zod.dev/).
- **Database:** SQLite (default) or PostgreSQL (recommended for production).

---

## 💻 Development Setup

### Prerequisites
- Node.js (v22+)
- npm (v10+)
- A running PostgreSQL instance (optional, SQLite is used by default)

### 1. Installation
```bash
git clone https://github.com/hnrkgrln/open-ea.git
cd open-ea
npm install
```

### 2. Database Synchronization
The project uses a base schema architecture to ensure consistency across different database engines.
```bash
cd server
# If using PostgreSQL, create a .env file:
# DATABASE_URL="postgresql://user:pass@localhost:5432/openea?schema=public"

# This command syncs the schema, generates the client, and seeds standard picklists:
npm run setup
```

### 3. Start Development Servers
Run these in separate terminals or use a task runner:
```bash
# Terminal 1: Backend API
cd server
npm run dev

# Terminal 2: Frontend
cd client
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) to access the application.

---

## 🏗 Production Deployment

### 1. Build the Frontend
```bash
cd client
npm run build
```
This generates a static SPA in `client/dist`. You can serve this via Nginx, Apache, or the Fastify backend itself (requires static file plugin configuration).

### 2. Prepare the Backend
Ensure your environment variables are set for the production database:
```bash
cd server
export DATABASE_URL="postgresql://prod_user:prod_pass@prod_host:5432/openea_prod"
npm run setup # Ensures prod DB is synced and client is generated
```

### 3. Run the Backend
```bash
cd server
npm start # Note: Ensure you have a 'start' script or use node src/index.ts with tsx/pm2
```

## 📝 License
This project is licensed under the MIT License.
