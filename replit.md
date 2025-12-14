# Ob-Havo (Weather App)

## Overview

A bilingual (Arabic/Uzbek) weather application built as a Telegram Mini App. The app displays weather information for Uzbekistan regions, includes a vocabulary learning feature for weather-related terms, and provides AI-powered weather advice. It features an oriental glass-themed UI design with prayer times display.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with custom glass-morphism theme
- **UI Components**: Shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth transitions and flip cards
- **Charts**: Recharts for weather forecast visualizations

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful endpoints under `/api/*`
- **Build Tool**: esbuild for server bundling, Vite for client

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Three main tables - `users`, `user_progress`, `weather_cache`
- **Migrations**: Drizzle Kit for schema management

### Key Design Patterns
- **Shared Schema**: Database schema defined in `shared/schema.ts` with Zod validation via drizzle-zod
- **Storage Abstraction**: `IStorage` interface for database operations
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

### Pages
- `/` - Home page with weather display and region selector
- `/forecast` - Weekly forecast with temperature charts
- `/admin` - Admin panel for Telegram bot and content management

## External Dependencies

### AI Integration
- **OpenAI API**: Used via Replit's AI Integrations service for generating weather advice and vocabulary examples
- **Model**: GPT-5 for natural language generation

### Telegram Integration
- **Telegram Bot API**: Webhook-based bot for weather updates
- **Telegram WebApp SDK**: Embedded in index.html for Mini App functionality
- **Environment Variables**: `TELEGRAM_BOT_TOKEN` required

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage (available but sessions not currently implemented)

### Weather Data
- Currently uses mock data from `client/src/data/regions.ts`
- Weather cache table supports real weather API integration (e.g., Yandex Weather)
- 30-minute cache refresh schedule implemented

### Fonts
- Inter (sans-serif for UI)
- Outfit (display headings)
- Amiri (Arabic text)