import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';

const CATEGORIES = [
  'Pork',
  'Chicken',
  'Beef',
  'Fish & Seafood',
  'Vegetable',
  'Non Rice Based'
];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length) {
  throw new Error(
    `Firebase configuration is incomplete: ${missingConfig.join(', ')}`
  );
}

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const authReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(
    auth,
    async user => {
      if (user) {
        unsubscribe();
        resolve(user);
        return;
      }

      try {
        const result = await signInAnonymously(auth);
        unsubscribe();
        resolve(result.user);
      } catch (error) {
        unsubscribe();
        reject(error);
      }
    },
    reject
  );
});

function normalizeList(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const result = [];
  const seen = new Set();

  rawItems.forEach(item => {
    const cleaned = String(item || '')
      .trim()
      .replace(/\s+/g, ' ');
    const key = cleaned.toLowerCase();

    if (cleaned && !seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  });

  return result;
}

function normalizeCategories(value) {
  return normalizeList(value).filter(category =>
    CATEGORIES.includes(category)
  );
}

function validateDish(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid dish information.');
  }

  if (!String(payload.dishName || '').trim()) {
    throw new Error('Dish name is required.');
  }

  if (!normalizeCategories(payload.mainCategories).length) {
    throw new Error(
      'Please select at least one main category.'
    );
  }

  if (!normalizeList(payload.mainIngredients).length) {
    throw new Error(
      'Please add at least one main ingredient.'
    );
  }
}

function serializeTimestamp(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toISOString();
}

function mapDish(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    dishName: String(data.dishName || ''),
    mainCategories: normalizeCategories(
      data.mainCategories
    ),
    mainIngredients: normalizeList(
      data.mainIngredients
    ),
    subIngredients: normalizeList(
      data.subIngredients
    ),
    description: String(data.description || ''),
    recipeGuideline: String(
      data.recipeGuideline || ''
    ),
    cookingInstructions: String(
      data.cookingInstructions || ''
    ),
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  };
}

function ingredientSuggestions(dishes) {
  const suggestions = new Map();

  dishes.forEach(dish => {
    [
      ...dish.mainIngredients,
      ...dish.subIngredients
    ].forEach(ingredient => {
      const cleaned = String(ingredient || '').trim();
      const key = cleaned.toLowerCase();
      if (cleaned && !suggestions.has(key)) {
        suggestions.set(key, cleaned);
      }
    });
  });

  return Array.from(suggestions.values()).sort(
    (a, b) => a.localeCompare(b)
  );
}

async function getAppData() {
  await authReady;
  const result = await getDocs(
    query(collection(db, 'dishes'), orderBy('dishName'))
  );
  const dishes = result.docs.map(mapDish);

  return {
    categories: CATEGORIES,
    dishes,
    ingredientSuggestions:
      ingredientSuggestions(dishes)
  };
}

async function saveDish(payload) {
  validateDish(payload);
  await authReady;

  const id = String(payload.id || '').trim();
  const dishRef = id
    ? doc(db, 'dishes', id)
    : doc(collection(db, 'dishes'));
  const isUpdate = Boolean(id);

  const dish = {
    dishName: String(payload.dishName).trim(),
    mainCategories: normalizeCategories(
      payload.mainCategories
    ),
    mainIngredients: normalizeList(
      payload.mainIngredients
    ),
    subIngredients: normalizeList(
      payload.subIngredients
    ),
    description: String(
      payload.description || ''
    ).trim(),
    recipeGuideline: String(
      payload.recipeGuideline || ''
    ).trim(),
    cookingInstructions: String(
      payload.cookingInstructions || ''
    ).trim(),
    updatedAt: serverTimestamp()
  };

  if (!isUpdate) {
    dish.createdAt = serverTimestamp();
  }

  await setDoc(dishRef, dish, { merge: isUpdate });

  return {
    success: true,
    message: isUpdate
      ? 'Dish updated successfully.'
      : 'Dish added successfully.'
  };
}

async function deleteDish(id) {
  if (!id) throw new Error('Dish not found.');
  await authReady;
  await deleteDoc(doc(db, 'dishes', String(id)));

  return {
    success: true,
    message: 'Dish deleted successfully.'
  };
}

window.ulamApi = {
  getAppData,
  saveDish,
  deleteDish
};

