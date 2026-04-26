export const FOOD_DATABASE = [
  // --- INDIAN CUISINE ---
  { main: "Cuisines", cuisine: "Indian", sub: "Paneer Dishes", name: "Paneer Tikka", calories: 280, protein: 18, carbs: 8, fats: 20, unit: "plate", portion: "6 pieces" },
  { main: "Cuisines", cuisine: "Indian", sub: "Paneer Dishes", name: "Palak Paneer", calories: 240, protein: 12, carbs: 10, fats: 18, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Paneer Dishes", name: "Matar Paneer", calories: 260, protein: 12, carbs: 14, fats: 16, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Chicken", name: "Chicken Tikka", calories: 220, protein: 30, carbs: 4, fats: 10, unit: "plate", portion: "6 pieces" },
  { main: "Cuisines", cuisine: "Indian", sub: "Chicken", name: "Chicken Biryani", calories: 450, protein: 22, carbs: 55, fats: 18, unit: "plate", portion: "350g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Chicken", name: "Butter Chicken", calories: 380, protein: 24, carbs: 12, fats: 26, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Veg", name: "Dal Tadka", calories: 150, protein: 8, carbs: 22, fats: 4, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Veg", name: "Aloo Gobi", calories: 120, protein: 3, carbs: 16, fats: 6, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Veg", name: "Mix Veg Curry", calories: 140, protein: 4, carbs: 18, fats: 7, unit: "bowl", portion: "250g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Breakfast", name: "Poha", calories: 250, protein: 4, carbs: 45, fats: 6, unit: "bowl", portion: "200g" },
  { main: "Cuisines", cuisine: "Indian", sub: "Breakfast", name: "Idli (2 pcs) with Sambar", calories: 180, protein: 6, carbs: 32, fats: 2, unit: "plate", portion: "2 idlis + sambar" },
  { main: "Cuisines", cuisine: "Indian", sub: "Breakfast", name: "Dosa (Plain)", calories: 120, protein: 3, carbs: 24, fats: 2, unit: "piece", portion: "1 large" },
  
  // --- AMERICAN CUISINE ---
  { main: "Cuisines", cuisine: "American", sub: "Burger", name: "Classic Cheeseburger", calories: 550, protein: 28, carbs: 45, fats: 28, unit: "piece", portion: "1 burger" },
  { main: "Cuisines", cuisine: "American", sub: "Steak", name: "Grilled Ribeye Steak", calories: 600, protein: 48, carbs: 0, fats: 45, unit: "plate", portion: "250g" },
  { main: "Cuisines", cuisine: "American", sub: "Chicken", name: "Fried Chicken Wings", calories: 480, protein: 32, carbs: 10, fats: 34, unit: "portion", portion: "6 wings" },
  { main: "Cuisines", cuisine: "American", sub: "Sides", name: "French Fries", calories: 312, protein: 3, carbs: 41, fats: 15, unit: "portion", portion: "Large (117g)" },

  // --- ARABIC CUISINE ---
  { main: "Cuisines", cuisine: "Arabic", sub: "Chicken", name: "Chicken Shawarma Wrap", calories: 420, protein: 24, carbs: 38, fats: 18, unit: "piece", portion: "1 wrap" },
  { main: "Cuisines", cuisine: "Arabic", sub: "Sides", name: "Hummus with Pita", calories: 330, protein: 10, carbs: 42, fats: 14, unit: "portion", portion: "100g hummus + 1 pita" },
  { main: "Cuisines", cuisine: "Arabic", sub: "Veg", name: "Falafel (4 pcs)", calories: 240, protein: 8, carbs: 24, fats: 12, unit: "plate", portion: "4 pieces" },

  // --- MEXICAN CUISINE ---
  { main: "Cuisines", cuisine: "Mexican", sub: "Tacos", name: "Beef Tacos (2)", calories: 310, protein: 18, carbs: 26, fats: 16, unit: "portion", portion: "2 soft tacos" },
  { main: "Cuisines", cuisine: "Mexican", sub: "Burrito", name: "Chicken Burrito", calories: 650, protein: 34, carbs: 70, fats: 22, unit: "piece", portion: "1 large" },

  // --- ITALIAN CUISINE ---
  { main: "Cuisines", cuisine: "Italian", sub: "Pasta", name: "Pasta Carbonara", calories: 580, protein: 22, carbs: 65, fats: 26, unit: "bowl", portion: "300g" },
  { main: "Cuisines", cuisine: "Italian", sub: "Pizza", name: "Margherita Pizza (Slice)", calories: 200, protein: 8, carbs: 26, fats: 7, unit: "slice", portion: "1 medium slice" },
  { main: "Cuisines", cuisine: "Italian", sub: "Veg", name: "Mushroom Risotto", calories: 350, protein: 10, carbs: 55, fats: 12, unit: "bowl", portion: "300g" },

  // --- CHICKEN CUTS ---
  { main: "Chicken", sub: "Raw", name: "Chicken Breast (Boneless)", calories: 165, protein: 31, carbs: 0, fats: 3.6, unit: "100g", portion: "100g raw" },
  { main: "Chicken", sub: "Raw", name: "Chicken Thigh (Boneless)", calories: 209, protein: 26, carbs: 0, fats: 11, unit: "100g", portion: "100g raw" },

  // --- FRUITS ---
  { main: "Fruits", sub: "Standard", name: "Apple", calories: 52, protein: 0.3, carbs: 14, fats: 0.2, unit: "piece", portion: "1 medium (100g)" },
  { main: "Fruits", sub: "Standard", name: "Banana", calories: 89, protein: 1.1, carbs: 23, fats: 0.3, unit: "piece", portion: "1 medium (100g)" },
  { main: "Fruits", sub: "Tropical", name: "Mango", calories: 60, protein: 0.8, carbs: 15, fats: 0.4, unit: "piece", portion: "100g" },

  // --- DRINKS ---
  { main: "Drinks", sub: "Soft Drink", name: "Coca Cola", calories: 139, protein: 0, carbs: 35, fats: 0, unit: "can", portion: "330ml" },
  { main: "Drinks", sub: "Natural", name: "Orange Juice (Fresh)", calories: 45, protein: 0.7, carbs: 10, fats: 0.2, unit: "glass", portion: "100ml" },
  { main: "Drinks", sub: "Alcohol", name: "Beer (Regular)", calories: 43, protein: 0.5, carbs: 3.6, fats: 0, unit: "glass", portion: "100ml" },
  { main: "Drinks", sub: "Alcohol", name: "Wine (Red)", calories: 85, protein: 0.1, carbs: 2.6, fats: 0, unit: "glass", portion: "125ml" },

  // --- DESSERTS ---
  { main: "Desserts", sub: "Indian", name: "Gulab Jamun (2 pcs)", calories: 300, protein: 4, carbs: 50, fats: 10, unit: "portion", portion: "2 pieces" },
  { main: "Desserts", sub: "American", name: "Chocolate Brownie", calories: 460, protein: 4, carbs: 55, fats: 26, unit: "piece", portion: "1 square" },
  { main: "Desserts", sub: "Italian", name: "Tiramisu", calories: 450, protein: 6, carbs: 35, fats: 32, unit: "portion", portion: "150g" },

  // --- BREADS ---
  { main: "Breads", sub: "Indian", name: "Butter Naan", calories: 300, protein: 8, carbs: 45, fats: 10, unit: "piece", portion: "1 large" },
  { main: "Breads", sub: "Indian", name: "Roti (Chapati)", calories: 80, protein: 3, carbs: 15, fats: 1, unit: "piece", portion: "1 medium" },
  { main: "Breads", sub: "Western", name: "Whole Wheat Bread", calories: 69, protein: 3.5, carbs: 12, fats: 1, unit: "slice", portion: "1 slice" },

  // --- SAUCES & CHUTNEYS ---
  { main: "Sauces", sub: "Western", name: "Mayonnaise", calories: 680, protein: 1, carbs: 1, fats: 75, unit: "spoon", portion: "1 tbsp" },
  { main: "Sauces", sub: "Western", name: "Ketchup", calories: 100, protein: 1, carbs: 25, fats: 0.1, unit: "spoon", portion: "1 tbsp" },
  { main: "Sauces", sub: "Indian", name: "Mint Chutney", calories: 15, protein: 1, carbs: 2, fats: 0.2, unit: "bowl", portion: "Small (50g)" },

  // --- VEGETABLES ---
  { main: "Vegetables", sub: "Salad", name: "Cucumber", calories: 15, protein: 0.7, carbs: 3.6, fats: 0.1, unit: "100g", portion: "100g" },
  { main: "Vegetables", sub: "Salad", name: "Tomato", calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2, unit: "100g", portion: "100g" },
  { main: "Vegetables", sub: "Greens", name: "Spinach", calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, unit: "100g", portion: "100g raw" },

  // --- EGGS ---
  { main: "Eggs", sub: "Basic", name: "Whole Egg (Large)", calories: 70, protein: 6, carbs: 0.6, fats: 5, unit: "piece", portion: "1 egg ≈ 50g" },
  { main: "Eggs", sub: "Basic", name: "Egg White (Large)", calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1, unit: "piece", portion: "1 egg white ≈ 33g" },
  { main: "Eggs", sub: "Global", name: "Scrambled Eggs (2 eggs)", calories: 190, protein: 13, carbs: 1.5, fats: 15, unit: "portion", portion: "2 eggs with butter" },
  { main: "Eggs", sub: "Global", name: "Eggs Benedict", calories: 550, protein: 22, carbs: 28, fats: 40, unit: "portion", portion: "2 eggs + muffin + ham" },
  { main: "Eggs", sub: "Global", name: "Egg Curry", calories: 240, protein: 13, carbs: 8, fats: 18, unit: "bowl", portion: "2 eggs + masala" },
  { main: "Eggs", sub: "Global", name: "Shakshuka", calories: 280, protein: 14, carbs: 12, fats: 20, unit: "bowl", portion: "2 eggs in tomato base" },
  { main: "Eggs", sub: "Global", name: "Egg Bhurji (Indian)", calories: 210, protein: 13, carbs: 4, fats: 16, unit: "portion", portion: "2 eggs with veggies" },

  // --- SUPPLEMENTS ---
  { main: "Supplements", sub: "Protein", name: "Whey Protein", calories: 120, protein: 24, carbs: 3, fats: 1.5, unit: "scoop", portion: "1 scoop (30g)" },
  { main: "Supplements", sub: "Fatloss", name: "L-Carnitine", calories: 0, protein: 0, carbs: 0, fats: 0, unit: "g", portion: "1g" },
  { main: "Supplements", sub: "Recovery", name: "Melatonin", calories: 0, protein: 0, carbs: 0, fats: 0, unit: "pill", portion: "1 unit" },
  { main: "Supplements", sub: "Vitamin", name: "Multivitamin", calories: 0, protein: 0, carbs: 0, fats: 0, unit: "pill", portion: "1 unit" },
];

export const EXERCISE_DATABASE = {
  "Chest": ["Bench Press", "Incline Dumbbell Press", "Pushups", "Chest Flyes"],
  "Back": ["Pullups", "Lat Pulldowns", "Rows", "Deadlifts"],
  "Legs": ["Squats", "Lunges", "Leg Press", "Calf Raises"],
  "Shoulders": ["Overhead Press", "Lateral Raises", "Front Raises"],
  "Arms": ["Bicep Curls", "Tricep Pushdowns", "Hammer Curls"],
  "Core": ["Plank", "Crunches", "Leg Raises"],
  "Cardio": ["Treadmill", "Running", "Cycling", "Walking", "Swimming", "Stair Climber", "Rowing Machine", "Jump Rope", "HIIT"],
  "Sports": {
    "Racket Sports": ["Badminton", "Tennis", "Squash", "Table Tennis"],
    "Team Sports": ["Football", "Basketball", "Cricket", "Volleyball", "Hockey"],
    "Combat Sports": ["Boxing", "MMA", "Judo", "Karate", "Wrestling"],
    "Others": ["Golf", "Archery", "Bowling"]
  },
  "Yoga": {
    "Vinyasa": ["Sun Salutation A", "Sun Salutation B", "Flow Sequence"],
    "Hatha": ["Mountain Pose", "Tree Pose", "Warrior I", "Warrior II", "Triangle Pose"],
    "Restorative": ["Child's Pose", "Corpse Pose", "Happy Baby"],
    "Power": ["Crow Pose", "Plank Flow", "Chaturanga Dandasana"]
  }
};

export const SPLITS = {
  "Full Body": ["Chest", "Back", "Legs", "Core"],
  "Push": ["Chest", "Shoulders", "Arms"],
  "Pull": ["Back", "Arms"],
};
