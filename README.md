# Milky - AI Diet Assistant

A comprehensive diet assistant application powered by Google's Gemini AI with Telegram integration for personalized meal planning, shopping lists, and automated meal reminders.

## 🌟 Features

### Core Functionality
- **AI-Powered Chat Interface**: Interactive conversation with Gemini AI for nutrition advice and meal planning
- **Personalized Meal Plans**: Generate customized meal plans based on dietary preferences, allergies, and goals
- **Smart Shopping Lists**: Automatically generate shopping lists from meal plans with categorized items
- **Telegram Notifications**: Automated meal reminders sent 2 hours before each meal with recipes and shopping lists
- **User Management**: Complete user registration, authentication, and profile management
- **Real-time Dashboard**: Overview of meal plans, progress tracking, and quick actions

### Technical Features
- **Modern React Frontend**: Built with React 18, styled-components, and Framer Motion
- **RESTful API**: Express.js backend with comprehensive API endpoints
- **Database Integration**: MongoDB with Mongoose for data persistence
- **Authentication**: JWT-based authentication with secure password hashing
- **Scheduled Tasks**: Automated notification system using node-cron
- **Responsive Design**: Mobile-first design with modern UI/UX

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- Google Gemini API key
- Telegram Bot Token (optional, for notifications)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Milky
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/milky-diet-assistant
   
   # Gemini AI
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Telegram Bot (optional)
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   
   # JWT
   JWT_SECRET=your_jwt_secret_here
   
   # Server
   PORT=5000
   NODE_ENV=development
   
   # Client URL
   CLIENT_URL=http://localhost:3000
   ```

4. **Start the application**
   ```bash
   npm run dev
   ```

   This will start both the backend server (port 5000) and frontend (port 3000).

## 📁 Project Structure

```
Milky/
├── server/                 # Backend Express.js application
│   ├── config/            # Database configuration
│   ├── middleware/        # Custom middleware (auth, validation)
│   ├── models/           # Mongoose data models
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   └── index.js          # Server entry point
├── client/               # Frontend React application
│   ├── public/           # Static assets
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── contexts/     # React contexts (Auth, etc.)
│   │   ├── pages/        # Page components
│   │   ├── styles/       # Global styles and themes
│   │   └── App.js        # Main App component
│   └── package.json
├── package.json          # Root package.json with scripts
└── README.md
```

## 🔧 API Endpoints

### Recipe Search
- `POST /api/recipes/search` - Query the recipe index (deterministic parser + Gemini fallback)
- `GET /api/recipes/status` - Check Elasticsearch connectivity

### Authentication
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - User login
- `GET /api/users/me` - Get current user
- `PUT /api/users/preferences` - Update user preferences
- `PUT /api/users/profile` - Update user profile

### Gemini AI Integration
- `POST /api/gemini/chat` - Chat with AI dietitian
- `POST /api/gemini/generate-meal-plan` - Generate AI meal plan
- `POST /api/gemini/recipe-suggestion` - Get recipe suggestions
- `POST /api/gemini/generate-shopping-list` - Generate shopping list

### Meal Plans
- `GET /api/meal-plans` - Get user's meal plans
- `POST /api/meal-plans` - Create new meal plan
- `POST /api/meal-plans/generate` - Generate AI meal plan
- `GET /api/meal-plans/:id` - Get specific meal plan
- `PUT /api/meal-plans/:id` - Update meal plan
- `POST /api/meal-plans/:id/activate` - Activate meal plan
- `DELETE /api/meal-plans/:id` - Delete meal plan

### Shopping Lists
- `GET /api/shopping-lists` - Get user's shopping lists
- `POST /api/shopping-lists` - Create shopping list
- `GET /api/shopping-lists/:id` - Get specific shopping list
- `PUT /api/shopping-lists/:id` - Update shopping list
- `GET /api/shopping-lists/:id/export` - Export shopping list

### Telegram Integration
- `GET /api/telegram/bot-info` - Get bot information
- `POST /api/telegram/send-test` - Send test message
- `POST /api/telegram/set-webhook` - Set webhook URL

## 🤖 Telegram Bot Setup

### Creating a Telegram Bot

1. **Create a new bot**
   - Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot` command
   - Follow the instructions to create your bot
   - Save the bot token

2. **Configure webhook (optional)**
   - Use the webhook endpoints to receive updates
   - Or use polling mode (default)

3. **Bot Commands**
   - `/start` - Initialize the bot and link account
   - `/link <username>` - Link web account to Telegram
   - `/help` - Show available commands
   - `/status` - Check notification settings
   - `/unlink` - Unlink Telegram account

### User Integration

1. Users register on the web app
2. Users message the Telegram bot with `/start`
3. Users link their account with `/link <username>`
4. Bot automatically sends meal reminders 2 hours before each meal

## 🎨 Frontend Features

### Dashboard
- Welcome section with quick actions
- Statistics cards showing progress
- Today's meals overview
- Telegram connection status

### AI Chat Interface
- Real-time conversation with Gemini AI
- Message history and context
- Typing indicators
- Responsive design

### Authentication
- Modern login/register forms
- JWT token management
- Protected routes
- User profile management

### Navigation
- Responsive sidebar navigation
- Mobile-friendly design
- User menu with profile options

## ⚡ Recipe indexing & search pipeline

1. **Prepare env**: set `ELASTICSEARCH_NODE`, `ELASTICSEARCH_RECIPE_INDEX`, and credentials in `.env`.  
2. **Run Elasticsearch locally**: e.g. `docker run -p 9200:9200 -e discovery.type=single-node -e xpack.security.enabled=false elasticsearch:8`.  
3. **Normalize + index recipes**: `node server/scripts/preprocessAndIndexRecipes.js --source /path/to/CookingRecipes.jsonl --index recipes`. Accepts `.json` array or `.jsonl`/`.ndjson`.  
4. **Query**: `POST /api/recipes/search` with `{ "query": "keto chicken dinner under 30 minutes", "filters": { "exclude_ingredients": ["peanut"] } }`. The API does a fast dictionary parse first, then falls back to Gemini (function-style JSON output) only when confidence is low.  
5. **Latency**: Elasticsearch filters on normalized ingredients, allergens, buckets (calories/protein), cuisine, meal type, and prep time. Use the `/api/recipes/status` endpoint to confirm ES connectivity before hitting search.

## 🔐 Security Features

- **Password Hashing**: bcryptjs for secure password storage
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Configuration**: Proper CORS setup for cross-origin requests
- **Input Validation**: Request validation and sanitization
- **Helmet.js**: Security headers for Express.js

## 📱 Responsive Design

The application is fully responsive and optimized for:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (320px - 767px)

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
GEMINI_API_KEY=your_gemini_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
JWT_SECRET=your_secure_jwt_secret
CLIENT_URL=https://your-frontend-domain.com
PORT=5000
```

### Build for Production

```bash
# Build frontend
npm run build

# Start production server
npm start
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server (both frontend and backend)
- `npm run server` - Start backend server only
- `npm run client` - Start frontend development server
- `npm run build` - Build frontend for production
- `npm start` - Start production server

### Code Structure

- **Backend**: Express.js with MVC pattern
- **Frontend**: React with functional components and hooks
- **Styling**: Styled-components with theme system
- **State Management**: React Context API
- **HTTP Client**: Axios with interceptors
- **Animations**: Framer Motion

## 📊 Database Models

### User Model
- Authentication fields (username, email, password)
- Preferences (diet type, allergies, meal times)
- Profile information (age, weight, height, goals)
- Telegram integration fields

### MealPlan Model
- User association
- Date range and status
- Daily meal structure
- Recipe details with nutrition info
- AI generation metadata

### ShoppingList Model
- User and meal plan association
- Categorized shopping items
- Purchase tracking
- Cost estimation
- Export functionality

## 🔄 Notification System

The notification system uses node-cron to:
1. Check for active meal plans every 5 minutes
2. Calculate reminder times based on user preferences
3. Send Telegram notifications 2 hours before meals
4. Include recipe details and shopping lists
5. Track sent notifications to prevent duplicates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-repo/issues) page
2. Create a new issue with detailed information
3. Include error logs and steps to reproduce

## 🙏 Acknowledgments

- [Google Gemini AI](https://ai.google.dev/) for AI capabilities
- [Telegram Bot API](https://core.telegram.org/bots/api) for notifications
- [React](https://reactjs.org/) and [Express.js](https://expressjs.com/) communities
- [MongoDB](https://www.mongodb.com/) for database support

---

**Milky** - Your AI-powered companion for healthy eating! 🥗✨





