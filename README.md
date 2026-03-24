# OpenAPM - Open Application Portfolio Management

OpenAPM is a modern, high-density enterprise architecture tool designed for small-to-medium organizations to manage their application inventory, business capabilities, and system integrations with a focus on visual health and strategic alignment.

## 🚀 Key Functionalities

### 📦 Application Inventory
- **High-Density Management:** Manage your software estate through visual grid cards or professional list views.
- **Advanced Filtering:** Instantly slice your inventory by Owner, Lifecycle Stage, Application Type, or health scores.
- **Metadata Support:** Define custom fields (Ranges, Strings, Dates) to match your organization's specific data needs.
- **Integration Tracking:** Manage bidirectional system dependencies (Sources and Targets) directly from the application dialog.

### 🏛️ Business Capability Mapping
- **Hierarchical Mapping:** Define a recursive tree of business functions to represent your organizational structure.
- **Strategic Inheritance:** Applications automatically inherit the highest **Business Criticality** from the capabilities they support, ensuring technical importance reflects business reality.
- **Recursive Discovery:** Filter diagrams by "Capability Area" to automatically include all applications within a specific business branch.

### 📊 Interactive Visualizations
- **Landscape View:** A structured grid layout of root capabilities and their nested systems, optimized for readability.
- **Integration Network:** A circular graph layout showing system dependencies and data flow types (API, Batch, etc.).
- **Heat Map Overlays:** Switch between **Business Criticality**, **Functional Fit**, and **Technical Fit** to visualize your architecture's health using semantic color palettes.
- **Unified Search:** A single powerful search bar that matches App Names, Descriptions, and Integration keywords across all views.

### ⚙️ Meta-model Configuration
- **Custom Picklists:** Manage global dropdowns with custom color schemes for visual consistency.
- **Bulk Range Generator:** Quickly create 1-5 scales with pre-defined color palettes (Good-to-Bad, Low-to-High, etc.) for standardized scoring.
- **Sticky UX:** The application remembers your chosen filters, view modes, and active tabs using local persistence.

## 🛠️ Tech Stack

- **Frontend:** React (TypeScript), Vite, [React Flow](https://reactflow.dev/) (Visualizations), [Radix UI](https://www.radix-ui.com/) (Primitives), [Lucide React](https://lucide.dev/) (Icons), [TanStack Query](https://tanstack.com/query/latest).
- **Backend:** Node.js, [Fastify](https://www.fastify.io/), [Prisma 6](https://www.prisma.io/) (ORM), [Zod](https://zod.dev/) (Validation).
- **Database:** SQLite.

## 🏁 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hnrkgrln/openapm.git
   cd openapm
   ```

2. **Setup the Backend:**
   ```bash
   cd server
   npm install
   # Initialize the database and seed it
   npx prisma migrate dev --name init
   npm run seed
   npm run dev
   ```

3. **Setup the Frontend:**
   ```bash
   # Open a new terminal
   cd client
   npm install
   npm run dev
   ```

4. **Access the app:**
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📝 License
This project is licensed under the MIT License.
