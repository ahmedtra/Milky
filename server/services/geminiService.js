const { GoogleGenerativeAI } = require('@google/generative-ai');

// Ingredient pools used to build a randomised blueprint before calling Gemini
const INGREDIENT_LIBRARY = {
  breakfast: [
    { name: 'Rolled oats', category: 'grain' },
    { name: 'Greek yogurt', category: 'dairy' },
    { name: 'Chia seeds', category: 'seed' },
    { name: 'Almond butter', category: 'nut' },
    { name: 'Banana', category: 'fruit' },
    { name: 'Blueberries', category: 'fruit' },
    { name: 'Eggs', category: 'protein' },
    { name: 'Spinach', category: 'vegetable' },
    { name: 'Whole grain bread', category: 'grain' },
    { name: 'Avocado', category: 'fat' },
    { name: 'Ricotta cheese', category: 'dairy' },
    { name: 'Smoked salmon', category: 'protein' },
    { name: 'Sun-dried tomatoes', category: 'vegetable' },
    { name: 'Pesto', category: 'fat' },
    { name: 'Mango', category: 'fruit' },
    { name: 'Coconut yogurt', category: 'dairy' },
    { name: 'Granola', category: 'grain' },
    { name: 'Hazelnuts', category: 'nut' },
    { name: 'Matcha powder', category: 'other' },
    { name: 'Buckwheat flour', category: 'grain' }
  ],
  lunch: [
    { name: 'Quinoa', category: 'grain' },
    { name: 'Brown rice', category: 'grain' },
    { name: 'Chicken breast', category: 'protein' },
    { name: 'Chickpeas', category: 'protein' },
    { name: 'Black beans', category: 'protein' },
    { name: 'Mixed greens', category: 'vegetable' },
    { name: 'Cherry tomatoes', category: 'vegetable' },
    { name: 'Cucumber', category: 'vegetable' },
    { name: 'Feta cheese', category: 'dairy' },
    { name: 'Salmon', category: 'protein' },
    { name: 'Arugula', category: 'vegetable' },
    { name: 'Farro', category: 'grain' },
    { name: 'Roasted red peppers', category: 'vegetable' },
    { name: 'Halloumi', category: 'dairy' },
    { name: 'Bulgur wheat', category: 'grain' },
    { name: 'Kimchi', category: 'vegetable' },
    { name: 'Seaweed salad', category: 'vegetable' },
    { name: 'Toasted sesame seeds', category: 'seed' },
    { name: 'Tzatziki', category: 'dairy' },
    { name: 'Roasted eggplant', category: 'vegetable' }
  ],
  dinner: [
    { name: 'Sweet potato', category: 'vegetable' },
    { name: 'Broccoli', category: 'vegetable' },
    { name: 'Lean beef', category: 'protein' },
    { name: 'Turkey mince', category: 'protein' },
    { name: 'Tofu', category: 'protein' },
    { name: 'Lentils', category: 'protein' },
    { name: 'Brown rice', category: 'grain' },
    { name: 'Whole wheat pasta', category: 'grain' },
    { name: 'Zucchini', category: 'vegetable' },
    { name: 'Bell pepper', category: 'vegetable' },
    { name: 'Cauliflower', category: 'vegetable' },
    { name: 'Shrimp', category: 'protein' },
    { name: 'Miso paste', category: 'other' },
    { name: 'Coconut milk', category: 'fat' },
    { name: 'Bok choy', category: 'vegetable' },
    { name: 'Brown lentil pasta', category: 'grain' },
    { name: 'Paneer', category: 'protein' },
    { name: 'Harissa', category: 'other' },
    { name: 'Polenta', category: 'grain' },
    { name: 'Roasted garlic', category: 'vegetable' }
  ],
  snack: [
    { name: 'Carrot sticks', category: 'vegetable' },
    { name: 'Hummus', category: 'protein' },
    { name: 'Apple', category: 'fruit' },
    { name: 'Mixed nuts', category: 'nut' },
    { name: 'Rice cakes', category: 'grain' },
    { name: 'Cottage cheese', category: 'dairy' },
    { name: 'Edamame', category: 'protein' },
    { name: 'Berries', category: 'fruit' },
    { name: 'Dark chocolate squares', category: 'other' },
    { name: 'Roasted chickpeas', category: 'protein' },
    { name: 'Apple butter', category: 'other' },
    { name: 'Matcha energy bites', category: 'other' },
    { name: 'Spiced almonds', category: 'nut' },
    { name: 'Seaweed crisps', category: 'vegetable' },
    { name: 'Protein yoghurt drink', category: 'dairy' }
  ]
};

const CUISINE_OPTIONS = [
  'Mediterranean',
  'Italian',
  'French',
  'Moroccan',
  'Japanese',
  'Thai',
  'Vietnamese',
  'Korean',
  'Mexican',
  'Middle Eastern',
  'Nordic',
  'Indian',
  'Spanish',
  'Greek',
  'Caribbean'
];

const FALLBACK_NAME_TEMPLATES = {
  breakfast: [
    '{cuisine} Sunrise {main}',
    '{main} & {second} {cuisine} Morning Plate',
    '{cuisine} Daybreak {course} with {main}',
    '{cuisine} Brunch-style {main} Stack'
  ],
  lunch: [
    '{cuisine} Midday {main} Platter',
    '{main} & {second} {cuisine} Lunch Tray',
    '{cuisine} Market {course} featuring {main}',
    '{cuisine} Bistro {main} Bowl'
  ],
  dinner: [
    '{cuisine} Evening {main} Feast',
    '{main} & {second} {cuisine} Supper',
    '{cuisine} Hearth {course} with {main}',
    '{cuisine} Nightfall {main} Plate'
  ],
  snack: [
    '{cuisine} Snack Bites with {main}',
    '{cuisine} Afternoon {main} Nibbles',
    '{main} & {second} {cuisine} Treat',
    '{cuisine} Street Snack: {main}'
  ],
  default: ['{cuisine} {course} with {main}']
};

// Removed the problematic text extraction function that was causing parsing issues

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async generateMealPlan(userPreferences, duration = 7) {
    // For longer meal plans, use a much simpler prompt to avoid JSON complexity issues
    const isLongPlan = duration > 3;
    const randomSeed = Math.floor(Math.random() * 1_000_000_000);

    console.log('🎲 Meal plan generation seed:', randomSeed);

    const ingredientBlueprint = this.buildIngredientBlueprint({
      preferences: userPreferences,
      duration,
      randomSeed
    });

    const blueprintJson = JSON.stringify(ingredientBlueprint, null, 2);

    const fallbackPlan = this.buildFallbackMealPlan({
      blueprint: ingredientBlueprint,
      preferences: userPreferences,
      duration,
      randomSeed
    });

    try {
      const prompt = isLongPlan ? `
        Create a simple ${duration}-day meal plan.

        Diet: ${userPreferences.dietType}
        Goals: ${userPreferences.goals}
        Random Seed: ${randomSeed}

        Base your meal ideas on this ingredient blueprint (each day includes a cuisine to lean into, and each meal already has a randomly curated set of ingredients you should transform into coherent recipes):

        ${blueprintJson}

        For each day, provide 3 meals (breakfast, lunch, dinner) with basic info only.
        
        IMPORTANT: Write ALL text (recipe names, descriptions, instructions) in ENGLISH only. Use cuisine-inspired flavors and ingredients, but keep all text in English.
        
        Return ONLY valid JSON with this structure:
        {
          "title": "Simple ${duration}-Day Meal Plan",
          "description": "Basic meal plan",
          "days": [
            {
              "date": "2024-01-01",
              "meals": [
                {
                  "type": "breakfast",
                  "scheduledTime": "08:00",
                  "recipes": [
                    {
                      "name": "Simple Breakfast",
                      "description": "Basic breakfast",
                      "prepTime": 5,
                      "cookTime": 10,
                      "servings": 1,
                      "ingredients": [
                        {"name": "Ingredient 1", "amount": "1", "unit": "cup", "category": "grain"},
                        {"name": "Ingredient 2", "amount": "1", "unit": "tbsp", "category": "dairy"}
                      ],
                      "instructions": ["Step 1", "Step 2"],
                      "nutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8},
                      "tags": ["simple"],
                      "difficulty": "easy"
                    }
                  ],
                  "totalNutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8}
                }
              ]
            }
          ]
        }
      ` : `
        Create a detailed ${duration}-day meal plan for someone with the following preferences:
        
        Diet Type: ${userPreferences.dietType}
        Allergies: ${userPreferences.allergies?.join(', ') || 'None'}
        Disliked Foods: ${userPreferences.dislikedFoods?.join(', ') || 'None'}
        Goals: ${userPreferences.goals}
        Activity Level: ${userPreferences.activityLevel}
        
        Meal Times:
        - Breakfast: ${userPreferences.mealTimes.breakfast}
        - Lunch: ${userPreferences.mealTimes.lunch}
        - Dinner: ${userPreferences.mealTimes.dinner}

        Ingredient blueprint to respect for each meal (each day lists its cuisine inspiration; reflect that cuisine in flavours and ingredients, but write everything in English):

        ${blueprintJson}

        IMPORTANT: Write ALL text (recipe names, descriptions, instructions) in ENGLISH only. Use cuisine-inspired flavors and ingredients, but keep all text in English.
        
        Please provide a comprehensive meal plan in JSON format. Respond with ONLY the JSON object (no additional text, explanations, or formatting). Use the following structure:
        {
          "title": "Meal Plan Title",
          "description": "Brief description of the meal plan",
          "days": [
            {
              "date": "YYYY-MM-DD",
              "meals": [
                {
                  "type": "breakfast|lunch|dinner|snack",
                  "scheduledTime": "HH:MM",
                  "recipes": [
                    {
                      "name": "Recipe Name",
                      "description": "Brief description",
                      "prepTime": number_in_minutes,
                      "cookTime": number_in_minutes,
                      "servings": number,
                      "ingredients": [
                        {
                          "name": "ingredient name",
                          "amount": "quantity",
                          "unit": "unit of measurement",
                          "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|other"
                        }
                      ],
                      "instructions": ["step 1", "step 2", ...],
                      "nutrition": {
                        "calories": number,
                        "protein": number,
                        "carbs": number,
                        "fat": number,
                        "fiber": number,
                        "sugar": number
                      },
                      "tags": ["tag1", "tag2"],
                      "difficulty": "easy|medium|hard"
                    }
                  ],
                  "totalNutrition": {
                    "calories": number,
                    "protein": number,
                    "carbs": number,
                    "fat": number
                  },
                  "notes": "Optional notes"
                }
              ]
            }
          ]
        }
        
        Make sure the meal plan is:
        1. Nutritionally balanced
        2. Varied and interesting
        3. Realistic cooking times
        4. Includes proper portion sizes
        5. Respects dietary restrictions and preferences
        6. Includes seasonal and fresh ingredients when possible

        Use the random seed ${randomSeed} to introduce creative variety while keeping results reproducible when the same preferences are provided with this seed.
        
        IMPORTANT: 
        1. Return ONLY the JSON object - no markdown formatting, no explanatory text
        2. Ensure all arrays and objects are properly closed with } and ]
        3. Use proper comma separation between array elements and object properties
        4. Validate your JSON structure before responding
        5. For longer meal plans, be extra careful with JSON syntax
      `;

      console.log('🤖 Calling Gemini API...');
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: {
          temperature: 1.1
        }
      });
      const response = await result.response;
      const text = response.text();
      console.log('✅ Gemini API responded, text length:', text.length);
      
      // Try to parse JSON from the response with better error handling
      console.log('Raw Gemini response length:', text.length);
      console.log('Raw Gemini response preview:', text.substring(0, 500));
      
      // Try to parse the JSON directly first
      try {
        const parsed = JSON.parse(text);
        console.log('✅ Successfully parsed meal plan directly:', parsed);
        return parsed;
      } catch (directParseError) {
        console.log('❌ Direct parsing failed, trying extraction methods...');
      }
      
      // Try multiple JSON extraction methods
      let jsonString = null;
      
      // Method 1: Extract JSON from markdown code blocks (```json ... ```)
      const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        jsonString = markdownMatch[1].trim();
        console.log('📝 Found JSON in markdown code block, length:', jsonString.length);
      }
      
      // Method 2: Look for JSON between curly braces
      if (!jsonString) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
          console.log('🔍 Found JSON match, length:', jsonString.length);
        }
      }
      
      // Method 3: Look for JSON starting with { and ending with }
      if (!jsonString) {
        const startIndex = text.indexOf('{');
        const lastIndex = text.lastIndexOf('}');
        if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
          jsonString = text.substring(startIndex, lastIndex + 1);
          console.log('📍 Found JSON by position, length:', jsonString.length);
        }
      }
      
      if (jsonString) {
        // Apply comprehensive cleaning for large JSON responses
        let cleanedJson = jsonString
          .replace(/,\s*}/g, '}')  // Remove trailing commas before }
          .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
          .replace(/"(\d{2}:\d{2})""/g, '"$1"')  // Fix "08:00"" -> "08:00"
          // Fix common JSON issues in large responses
          .replace(/,\s*,/g, ',')  // Remove double commas
          .replace(/\n\s*\n/g, '\n')  // Remove empty lines
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .replace(/,\s*}/g, '}')  // Remove trailing commas before } (again)
          .replace(/,\s*]/g, ']');  // Remove trailing commas before ] (again)

        // Try parsing the JSON as-is first
        try {
          console.log('🔍 Trying to parse JSON as-is...');
          const parsed = JSON.parse(jsonString);
          console.log('✅ Successfully parsed meal plan directly!');
          console.log('📊 Meal plan stats:', {
            title: parsed.title,
            days: parsed.days?.length,
            firstDayMeals: parsed.days?.[0]?.meals?.length
          });
          return parsed;
        } catch (directParseError) {
          console.log('❌ Direct parsing failed, trying minimal cleaning...');
          
          try {
            console.log('🔧 Trying minimal cleaned JSON...');
            const parsed = JSON.parse(cleanedJson);
            console.log('✅ Successfully parsed with minimal cleaning!');
            console.log('📊 Meal plan stats:', {
              title: parsed.title,
              days: parsed.days?.length,
              firstDayMeals: parsed.days?.[0]?.meals?.length
            });
            return parsed;
          } catch (minimalParseError) {
            console.error('❌ Minimal cleaning also failed');
            console.error('Direct parse error:', directParseError.message);
            console.error('Minimal parse error:', minimalParseError.message);
            
            // Try aggressive cleaning as last resort
            console.log('🔧 Trying aggressive cleaning...');
            let aggressiveCleaned = cleanedJson
              .replace(/[^\x20-\x7E\n\r\t]/g, '')  // Remove non-printable characters
              .replace(/\s+/g, ' ')  // Normalize all whitespace
              .replace(/,\s*,/g, ',')  // Fix double commas
              .replace(/,\s*}/g, '}')  // Remove trailing commas
              .replace(/,\s*]/g, ']')  // Remove trailing commas
              .replace(/\{\s*,/g, '{')  // Remove leading commas in objects
              .replace(/\[\s*,/g, '[');  // Remove leading commas in arrays
            
            try {
              const aggressiveParsed = JSON.parse(aggressiveCleaned);
              console.log('✅ Successfully parsed with aggressive cleaning!');
              console.log('📊 Meal plan stats:', {
                title: aggressiveParsed.title,
                days: aggressiveParsed.days?.length,
                firstDayMeals: aggressiveParsed.days?.[0]?.meals?.length
              });
              return aggressiveParsed;
            } catch (aggressiveParseError) {
              console.error('❌ Even aggressive cleaning failed');
              console.error('Raw JSON preview:', jsonString.substring(0, 500));
              console.error('Cleaned JSON preview:', cleanedJson.substring(0, 500));
              console.error('Aggressive cleaned preview:', aggressiveCleaned.substring(0, 500));
              throw aggressiveParseError;
            }
          }
        }
      }
      
      // If all parsing methods fail, throw to trigger fallback handling
      console.log('All parsing methods failed, will return fallback meal plan');
      throw new Error('Failed to parse meal plan from AI response');
    } catch (error) {
      console.error('Error generating meal plan:', error);
      console.warn('⚠️ Falling back to deterministic meal plan due to error:', error.message);
      return fallbackPlan;
    }
  }

  async chatWithDietitian(message, conversationHistory = [], activeMealPlan = null, user = null) {
    try {
      console.log('💬 Chat request:', {
        hasMealPlan: !!activeMealPlan,
        hasUser: !!user,
        mealPlanTitle: activeMealPlan?.title,
        mealPlanDays: activeMealPlan?.days?.length
      });

      // Build meal plan context if available
      let mealPlanContext = '';
      if (activeMealPlan && activeMealPlan.days && activeMealPlan.days.length > 0) {
        console.log('✅ Including meal plan context in chat');
        mealPlanContext = `\n\n**USER'S ACTIVE MEAL PLAN CONTEXT:**
        
        Title: ${activeMealPlan.title}
        Description: ${activeMealPlan.description || 'No description'}
        Duration: ${activeMealPlan.days.length} days
        Status: ${activeMealPlan.status}
        Start Date: ${activeMealPlan.startDate ? new Date(activeMealPlan.startDate).toLocaleDateString() : 'N/A'}
        End Date: ${activeMealPlan.endDate ? new Date(activeMealPlan.endDate).toLocaleDateString() : 'N/A'}
        
        **DAILY MEALS OVERVIEW:**
        ${activeMealPlan.days.map((day, idx) => {
          const dayDate = day.date ? new Date(day.date).toLocaleDateString() : `Day ${idx + 1}`;
          const meals = day.meals.map(meal => {
            const recipeNames = meal.recipes.map(r => r.name).join(', ');
            return `  • ${meal.type.charAt(0).toUpperCase() + meal.type.slice(1)} (${meal.scheduledTime}): ${recipeNames}`;
          }).join('\n');
          return `Day ${idx + 1} (${dayDate}):\n${meals}`;
        }).join('\n\n')}
        
        Use this meal plan context to provide personalized advice. Reference specific meals, recipes, or days when relevant to the user's question.`;
      } else {
        console.log('⚠️ No meal plan context available for chat');
      }

      // Build user profile context if available
      let userContext = '';
      if (user && user.preferences) {
        userContext = `\n\n**USER PROFILE:**
        
        Diet Type: ${user.preferences.dietType || 'Not specified'}
        Allergies: ${user.preferences.allergies && user.preferences.allergies.length > 0 ? user.preferences.allergies.join(', ') : 'None'}
        Disliked Foods: ${user.preferences.dislikedFoods && user.preferences.dislikedFoods.length > 0 ? user.preferences.dislikedFoods.join(', ') : 'None'}
        ${user.profile ? `
        Activity Level: ${user.profile.activityLevel || 'Not specified'}
        Goals: ${user.profile.goals || 'Not specified'}
        Age: ${user.profile.age || 'Not specified'}
        Weight: ${user.profile.weight ? `${user.profile.weight} kg` : 'Not specified'}
        Height: ${user.profile.height ? `${user.profile.height} cm` : 'Not specified'}` : ''}
        
        Take into account this user profile when providing advice.`;
      }

      const systemPrompt = `
        You are a professional nutritionist and dietitian with expertise in:
        - Personalized nutrition planning
        - Dietary restrictions and allergies
        - Weight management
        - Sports nutrition
        - Medical nutrition therapy
        - Meal planning and cooking
        
        Provide helpful, accurate, and personalized advice. Always recommend consulting with a healthcare professional for medical conditions.
        Keep responses concise but informative.
        ${mealPlanContext}${userContext}
        
        **IMPORTANT FORMATTING GUIDELINES:**
        - Use line breaks to separate different topics or sections
        - Use bullet points (- or •) for lists of items, tips, or recommendations
        - Use numbered lists (1., 2., 3.) for step-by-step instructions
        - Use **bold text** for important points or headings
        - Use *italic text* for emphasis
        - Use \`code formatting\` for specific measurements or technical terms
        - Use > blockquotes for important notes or warnings
        - Always format your response for easy reading with proper spacing
      `;

      const fullPrompt = `${systemPrompt}\n\nConversation History:\n${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\nUser: ${message}\n\nAssistant:`;

      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error in dietitian chat:', error);
      
      // Check for specific API errors
      if (error.message.includes('404 Not Found')) {
        throw new Error('Gemini API model not found. Please check your API key and model name.');
      } else if (error.message.includes('API key')) {
        throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY environment variable.');
      } else if (error.message.includes('quota')) {
        throw new Error('Gemini API quota exceeded. Please check your usage limits.');
      }
      
      throw new Error('Failed to get dietitian response: ' + error.message);
    }
  }

  async generateShoppingList(mealPlan) {
    try {
      const extractedIngredients = this.extractIngredientsFromMealPlan(mealPlan);

      if (extractedIngredients.length === 0) {
        throw new Error('Meal plan does not contain any ingredients to convert into a shopping list');
      }

      const consolidatedIngredients = this.consolidateIngredients(extractedIngredients);

      try {
        const prompt = `
        Create a comprehensive shopping list from these ingredients:
        
        ${JSON.stringify(consolidatedIngredients, null, 2)}
        
        Please organize the shopping list by store sections and provide the following JSON format:
        {
          "title": "Shopping List Title",
          "description": "Brief description",
          "items": [
            {
              "name": "ingredient name",
              "amount": "total quantity needed",
              "unit": "unit of measurement",
              "category": "produce|meat|dairy|pantry|frozen|bakery|beverages|other",
              "priority": "low|medium|high",
              "estimatedPrice": number,
              "notes": "any special notes"
            }
          ],
          "totalEstimatedCost": number,
          "store": "suggested store type"
        }
        
        Please:
        1. Group similar items together
        2. Calculate total quantities needed
        3. Suggest appropriate store categories
        4. Estimate reasonable prices
        5. Add helpful notes for shopping
      `;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('🤖 Shopping list generation response length:', text.length);

        // Try to parse JSON directly first
        try {
          const parsed = JSON.parse(text);
          console.log('✅ Successfully parsed shopping list directly');

          // Validate and fix shopping list items
          if (parsed.items && Array.isArray(parsed.items)) {
            parsed.items = parsed.items.map(item => ({
              ...item,
              amount: item.amount || '1',
              unit: item.unit || 'piece',
              category: item.category || 'other',
              priority: item.priority || 'medium',
              purchased: item.purchased || false
            }));
          }

          return parsed;
        } catch (directParseError) {
          console.log('❌ Direct parsing failed, trying extraction methods...');
        }

        // Try multiple JSON extraction methods
        let jsonString = null;

        // Method 1: Extract JSON from markdown code blocks (```json ... ```)
        const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (markdownMatch) {
          jsonString = markdownMatch[1].trim();
          console.log('📝 Found JSON in markdown code block, length:', jsonString.length);
        }

        // Method 2: Look for JSON between curly braces
        if (!jsonString) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonString = jsonMatch[0];
            console.log('🔍 Found JSON match, length:', jsonString.length);
          }
        }

        // Method 3: Look for JSON starting with { and ending with }
        if (!jsonString) {
          const startIndex = text.indexOf('{');
          const lastIndex = text.lastIndexOf('}');
          if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
            jsonString = text.substring(startIndex, lastIndex + 1);
            console.log('📍 Found JSON by position, length:', jsonString.length);
          }
        }

        if (jsonString) {
          // Try parsing the JSON as-is first
          try {
            const parsed = JSON.parse(jsonString);
            console.log('✅ Successfully parsed shopping list!');

            // Validate and fix shopping list items
            if (parsed.items && Array.isArray(parsed.items)) {
              parsed.items = parsed.items.map(item => ({
                ...item,
                amount: item.amount || '1',
                unit: item.unit || 'piece',
                category: item.category || 'other',
                priority: item.priority || 'medium',
                purchased: item.purchased || false
              }));
            }

            return parsed;
          } catch (parseError) {
            console.error('❌ JSON parsing failed:', parseError.message);
            console.log('Raw JSON preview:', jsonString.substring(0, 500));

            // Try cleaning the JSON
            let cleanedJson = jsonString
              .replace(/,\s*}/g, '}')  // Remove trailing commas before }
              .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
              .replace(/,\s*,/g, ',')  // Remove double commas
              .replace(/\n\s*\n/g, '\n')  // Remove empty lines
              .replace(/\s+/g, ' ');  // Normalize whitespace

            try {
              const cleanedParsed = JSON.parse(cleanedJson);
              console.log('✅ Successfully parsed with cleaning!');

              // Validate and fix shopping list items
              if (cleanedParsed.items && Array.isArray(cleanedParsed.items)) {
                cleanedParsed.items = cleanedParsed.items.map(item => ({
                  ...item,
                  amount: item.amount || '1',
                  unit: item.unit || 'piece',
                  category: item.category || 'other',
                  priority: item.priority || 'medium',
                  purchased: item.purchased || false
                }));
              }

              return cleanedParsed;
            } catch (cleanedParseError) {
              console.error('❌ Even cleaning failed:', cleanedParseError.message);
              throw new Error('Could not parse JSON from Gemini response after cleaning');
            }
          }
        }

        throw new Error('Could not find JSON in Gemini response');
      } catch (aiError) {
        console.warn('⚠️ Gemini shopping list generation failed, using deterministic fallback:', aiError.message);
        return this.buildFallbackShoppingList(consolidatedIngredients, mealPlan);
      }
    } catch (error) {
      console.error('Error generating shopping list:', error);
      throw new Error('Failed to generate shopping list: ' + error.message);
    }
  }

  extractIngredientsFromMealPlan(mealPlan = {}) {
    const ingredients = [];

    if (!mealPlan || !Array.isArray(mealPlan.days)) {
      return ingredients;
    }

    mealPlan.days.forEach(day => {
      const meals = Array.isArray(day?.meals) ? day.meals : [];

      meals.forEach(meal => {
        const recipes = Array.isArray(meal?.recipes) ? meal.recipes : [];

        if (recipes.length > 0) {
          recipes.forEach(recipe => {
            const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];

            recipeIngredients.forEach(ingredient => {
              const normalised = this.normalizeIngredient(ingredient);
              if (normalised) {
                ingredients.push(normalised);
              }
            });
          });
          return;
        }

        const mealLevelIngredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
        mealLevelIngredients.forEach(ingredient => {
          const normalised = this.normalizeIngredient(ingredient);
          if (normalised) {
            ingredients.push(normalised);
          }
        });
      });
    });

    return ingredients;
  }

  normalizeIngredient(rawIngredient = {}) {
    const nameCandidate = rawIngredient.name || rawIngredient.item || rawIngredient.ingredient;
    if (!nameCandidate) {
      return null;
    }

    const amountCandidate = rawIngredient.amount ?? rawIngredient.quantity ?? rawIngredient.qty ?? '1';
    const unitCandidate = rawIngredient.unit || rawIngredient.measure || rawIngredient.measurement || '';
    const categoryCandidate = rawIngredient.category || rawIngredient.type || 'other';

    const normalised = {
      name: String(nameCandidate).trim(),
      amount: String(amountCandidate || '1').trim() || '1',
      unit: String(unitCandidate || 'unit').trim() || 'unit',
      category: String(categoryCandidate || 'other').trim().toLowerCase() || 'other'
    };

    if (!normalised.name) {
      return null;
    }

    if (rawIngredient.notes) {
      normalised.notes = rawIngredient.notes;
    }

    if (rawIngredient.estimatedPrice !== undefined) {
      const numericPrice = Number(rawIngredient.estimatedPrice);
      if (!Number.isNaN(numericPrice)) {
        normalised.estimatedPrice = numericPrice;
      }
    }

    return normalised;
  }

  buildFallbackShoppingList(consolidatedIngredients, mealPlan = {}) {
    const items = consolidatedIngredients.map(item => {
      const fallbackItem = {
        name: item.name,
        amount: item.amount || '1',
        unit: item.unit || 'unit',
        category: item.category || 'other',
        priority: 'medium',
        purchased: false
      };

      if (item.notes) {
        fallbackItem.notes = item.notes;
      }

      if (item.estimatedPrice !== undefined) {
        fallbackItem.estimatedPrice = item.estimatedPrice;
      }

      return fallbackItem;
    });

    const totalEstimatedCost = items.reduce((sum, item) => {
      return sum + (item.estimatedPrice || 0);
    }, 0);

    return {
      title: mealPlan?.title ? `${mealPlan.title} Shopping List` : 'Shopping List',
      description: 'Generated from meal plan ingredients',
      items,
      totalEstimatedCost,
      store: 'Grocery store'
    };
  }

  buildIngredientBlueprint({ preferences, duration, randomSeed }) {
    const random = this.createSeededRandom(randomSeed);
    const mealTypes = this.resolveMealTypes(preferences);
    const disliked = new Set((preferences.dislikedFoods || []).map(item => item.toLowerCase()));
    const allergies = new Set((preferences.allergies || []).map(item => item.toLowerCase()));
    const dietType = (preferences.dietType || 'balanced').toLowerCase();

    const blueprint = [];
    for (let dayIndex = 0; dayIndex < duration; dayIndex += 1) {
      const cuisine = this.pickCuisine(random);
      const meals = mealTypes.map(type => {
        const ingredients = this.pickIngredientsForMeal({
          mealType: type,
          random,
          disliked,
          allergies,
          dietType
        });

        return {
          type,
          cuisine,
          suggestedTime: preferences.mealTimes?.[type] || this.defaultMealTimes()[type],
          ingredients
        };
      });

      blueprint.push({
        day: dayIndex + 1,
        cuisine,
        meals
      });
    }

    return blueprint;
  }

  pickIngredientsForMeal({ mealType, random, disliked, allergies, dietType }) {
    const pool = [...(INGREDIENT_LIBRARY[mealType] || INGREDIENT_LIBRARY.breakfast)];

    const filteredPool = pool.filter(item => {
      const lowerName = item.name.toLowerCase();
      if (disliked.has(lowerName)) return false;
      if (allergies.has(lowerName)) return false;

      if (dietType.includes('vegetarian')) {
        if (['chicken', 'beef', 'turkey', 'salmon'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      if (dietType.includes('vegan')) {
        if (['egg', 'yogurt', 'cheese', 'butter', 'milk'].some(dairy => lowerName.includes(dairy))) {
          return false;
        }
        if (['chicken', 'beef', 'turkey', 'salmon', 'fish'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      if (dietType.includes('pescatarian')) {
        if (['beef', 'turkey', 'chicken'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      return true;
    });

    const baseSize = mealType === 'snack' ? 2 : 3;
    const selectionSize = baseSize + Math.round(random() * (mealType === 'snack' ? 1 : 2));
    const ingredients = [];
    const workingPool = filteredPool.length > 0 ? filteredPool : pool;

    const usedIndices = new Set();
    while (ingredients.length < selectionSize && usedIndices.size < workingPool.length) {
      const index = Math.floor(random() * workingPool.length);
      if (usedIndices.has(index)) {
        continue;
      }
      usedIndices.add(index);
      ingredients.push(workingPool[index]);
    }

    return ingredients;
  }

  resolveMealTypes(preferences) {
    const hasSnacks = preferences.includeSnacks ?? true;
    const mealTimes = preferences.mealTimes || {};

    const baseTypes = ['breakfast', 'lunch', 'dinner'];
    if (hasSnacks || mealTimes.snack) {
      baseTypes.push('snack');
    }

    return baseTypes;
  }

  defaultMealTimes() {
    return {
      breakfast: '08:00',
      lunch: '12:30',
      dinner: '19:00',
      snack: '15:30'
    };
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  pickCuisine(random) {
    return CUISINE_OPTIONS[Math.floor(random() * CUISINE_OPTIONS.length)];
  }

  buildFallbackMealPlan({ blueprint, preferences, duration, randomSeed }) {
    const today = new Date();
    const dietLabel = this.capitalize(preferences.dietType || 'balanced');
    const random = this.createSeededRandom((randomSeed || Date.now()) + 2024);

    const days = blueprint.map((blueprintDay, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const cuisine = blueprintDay.cuisine || this.pickCuisine(random);
      const cuisineName = this.capitalizeWords(cuisine);
      const cuisineSlug = cuisineName.toLowerCase().replace(/\s+/g, '-');

      const meals = blueprintDay.meals.map(meal => {
        const recipeNameBase = `${this.capitalize(meal.type)} Bowl`;
        const keyIngredients = meal.ingredients.slice(0, 3).map(item => item.name);
        const recipeName = this.buildFallbackRecipeName({
          mealType: meal.type,
          cuisine: cuisineName,
          keyIngredients,
          random
        }) || recipeNameBase;

        const ingredients = meal.ingredients.map(item => ({
          name: item.name,
          amount: item.amount || '1',
          unit: item.unit || 'portion',
          category: item.category || 'other'
        }));

        return {
          type: meal.type,
          scheduledTime: meal.suggestedTime || this.defaultMealTimes()[meal.type],
          recipes: [
            {
              name: recipeName,
              description: `${cuisineName}-inspired ${meal.type} featuring ${this.formatIngredientList(keyIngredients)}.`,
              prepTime: 10,
              cookTime: 15,
              servings: 1,
              ingredients,
              instructions: [
                'Prepare the ingredients as needed (wash, chop, cook where appropriate).',
                `Combine the ingredients to create a ${cuisineName}-style ${meal.type}.`,
                `Finish with herbs, spices, or condiments that complement ${cuisineName} flavours.`
              ],
              nutrition: {
                calories: 450,
                protein: 25,
                carbs: 45,
                fat: 18
              },
              tags: ['fallback', meal.type, cuisineSlug],
              difficulty: 'easy'
            }
          ],
          totalNutrition: {
            calories: 450,
            protein: 25,
            carbs: 45,
            fat: 18
          },
          cuisine: cuisineName
        };
      });

      return {
        date: date.toISOString().split('T')[0],
        cuisine: cuisineName,
        meals
      };
    });

    return {
      title: `${dietLabel} ${duration}-Day Meal Plan (Fallback)`,
      description: 'Generated locally using selected ingredients because the AI response could not be parsed.',
      days
    };
  }

  capitalize(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  capitalizeWords(value) {
    if (!value) return '';
    return value
      .split(/\s|-/)
      .filter(Boolean)
      .map(word => this.capitalize(word))
      .join(' ');
  }

  formatIngredientList(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      return 'fresh pantry staples';
    }
    const formatted = ingredients.map(item => this.capitalizeWords(item));
    if (formatted.length === 1) return formatted[0];
    const last = formatted.pop();
    return `${formatted.join(', ')} and ${last}`;
  }

  buildFallbackRecipeName({ mealType, cuisine, keyIngredients, random }) {
    const templates = FALLBACK_NAME_TEMPLATES[mealType] || FALLBACK_NAME_TEMPLATES.default;
    const template = templates[Math.floor(random() * templates.length)];
    const main = this.capitalizeWords(keyIngredients[0] || mealType);
    const second = this.capitalizeWords(keyIngredients[1] || keyIngredients[0] || mealType);
    return template
      .replace('{cuisine}', cuisine)
      .replace('{main}', main)
      .replace('{second}', second)
      .replace('{course}', this.capitalize(mealType));
  }

  consolidateIngredients(ingredients) {
    const consolidated = {};

    ingredients.forEach(ingredient => {
      if (!ingredient || !ingredient.name) {
        return;
      }

      const unitKey = (ingredient.unit || 'unit').toLowerCase();
      const key = `${ingredient.name.toLowerCase()}__${unitKey}`;

      if (consolidated[key]) {
        const existingAmount = parseFloat(consolidated[key].amount);
        const newAmount = parseFloat(ingredient.amount);

        if (!Number.isNaN(existingAmount) && !Number.isNaN(newAmount)) {
          consolidated[key].amount = (existingAmount + newAmount).toString();
        } else if (!consolidated[key].amount) {
          consolidated[key].amount = ingredient.amount;
        }

        if (!consolidated[key].notes && ingredient.notes) {
          consolidated[key].notes = ingredient.notes;
        }

        if (ingredient.estimatedPrice !== undefined) {
          const numericPrice = Number(ingredient.estimatedPrice);
          if (!Number.isNaN(numericPrice)) {
            const existingPrice = Number(consolidated[key].estimatedPrice) || 0;
            consolidated[key].estimatedPrice = existingPrice + numericPrice;
          }
        }
      } else {
        consolidated[key] = { ...ingredient };
      }
    });

    return Object.values(consolidated);
  }

  async getRecipeSuggestion(ingredients, dietType, mealType) {
    try {
      const prompt = `
        Suggest a recipe for ${mealType} using these ingredients: ${ingredients.join(', ')}
        
        Diet type: ${dietType}
        
        Please provide a recipe in JSON format:
        {
          "name": "Recipe Name",
          "description": "Brief description",
          "prepTime": number_in_minutes,
          "cookTime": number_in_minutes,
          "servings": number,
          "ingredients": [
            {
              "name": "ingredient name",
              "amount": "quantity",
              "unit": "unit of measurement",
              "category": "protein|vegetable|fruit|grain|dairy|fat|spice|other"
            }
          ],
          "instructions": ["step 1", "step 2", ...],
          "nutrition": {
            "calories": number,
            "protein": number,
            "carbs": number,
            "fat": number
          },
          "difficulty": "easy|medium|hard"
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      throw new Error('Could not parse JSON from Gemini response');
    } catch (error) {
      console.error('Error getting recipe suggestion:', error);
      throw new Error('Failed to get recipe suggestion: ' + error.message);
    }
  }
}

module.exports = new GeminiService();
