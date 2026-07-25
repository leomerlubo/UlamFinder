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
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
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
const googleProvider = new GoogleAuthProvider();

function canEdit(user = auth.currentUser) {
  return Boolean(user && user.email);
}

async function requireEditor() {
  if (!auth.currentUser) {
    throw new Error(
      'Please sign in with an approved Google account.'
    );
  }

}

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

function normalizeVariant(value) {
  const source =
    value && typeof value === 'object' ? value : {};
  const mainCategory =
    CATEGORIES.includes(source.mainCategory)
      ? source.mainCategory
      : normalizeCategories(source.mainCategories)[0] || '';

  return {
    name:
      String(source.name || '').trim(),
    mainCategory,
    mainIngredients: normalizeList(
      source.mainIngredients
    ),
    subIngredients: normalizeList(
      source.subIngredients
    ),
    description: String(
      source.description || ''
    ).trim(),
    recipeGuideline: String(
      source.recipeGuideline || ''
    ).trim(),
    cookingInstructions: String(
      source.cookingInstructions || ''
    ).trim()
  };
}

function normalizeVariants(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeVariant)
    .filter(variant =>
      variant.mainCategory ||
      variant.mainIngredients.length ||
      variant.name
    );
}

function variantsFromLegacyDish(data) {
  const categories = normalizeCategories(
    data.mainCategories
  );
  const sharedDetails = {
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
    )
  };

  return categories.map(category =>
    normalizeVariant(
      {
        name: category,
        mainCategory: category,
        ...sharedDetails
      }
    )
  );
}

function validateDish(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid dish information.');
  }

  if (!String(payload.dishName || '').trim()) {
    throw new Error('Dish name is required.');
  }

  const variants = normalizeVariants(payload.variants);

  if (!variants.length) {
    throw new Error(
      'Please add at least one dish variant.'
    );
  }

  variants.forEach((variant, index) => {
    const label = variant.name || `Variant ${index + 1}`;

    if (!variant.name) {
      throw new Error(
        `Please enter a name for variant ${index + 1}.`
      );
    }

    if (!variant.mainCategory) {
      throw new Error(
        `Please select a category for ${label}.`
      );
    }

    if (!variant.mainIngredients.length) {
      throw new Error(
        `Please add a main ingredient for ${label}.`
      );
    }
  });
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
  const savedVariants = normalizeVariants(data.variants);
  const variants = savedVariants.length
    ? savedVariants
    : variantsFromLegacyDish(data);
  const firstVariant = variants[0] || normalizeVariant({});

  return {
    id: snapshot.id,
    dishName: String(data.dishName || ''),
    variants,
    mainCategories: normalizeList(
      variants.map(variant => variant.mainCategory)
    ),
    mainIngredients: normalizeList(
      variants.flatMap(
        variant => variant.mainIngredients
      )
    ),
    subIngredients: normalizeList(
      variants.flatMap(
        variant => variant.subIngredients
      )
    ),
    description: firstVariant.description,
    recipeGuideline: firstVariant.recipeGuideline,
    cookingInstructions: firstVariant.cookingInstructions,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  };
}

function ingredientSuggestions(dishes) {
  const suggestions = new Map();

  dishes.forEach(dish => {
    dish.variants.flatMap(variant => [
      ...variant.mainIngredients,
      ...variant.subIngredients
    ]).forEach(ingredient => {
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
  await requireEditor();

  const id = String(payload.id || '').trim();
  const dishRef = id
    ? doc(db, 'dishes', id)
    : doc(collection(db, 'dishes'));
  const isUpdate = Boolean(id);
  const variants = normalizeVariants(payload.variants);
  const firstVariant = variants[0];

  const dish = {
    dishName: String(payload.dishName).trim(),
    variants,
    mainCategories: normalizeList(
      variants.map(variant => variant.mainCategory)
    ),
    mainIngredients: normalizeList(
      variants.flatMap(
        variant => variant.mainIngredients
      )
    ),
    subIngredients: normalizeList(
      variants.flatMap(
        variant => variant.subIngredients
      )
    ),
    description: firstVariant.description,
    recipeGuideline: firstVariant.recipeGuideline,
    cookingInstructions: firstVariant.cookingInstructions,
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
  await requireEditor();
  await deleteDoc(doc(db, 'dishes', String(id)));

  return {
    success: true,
    message: 'Dish deleted successfully.'
  };
}

async function signInEditor() {
  const result = await signInWithPopup(
    auth,
    googleProvider
  );

  return result.user;
}

function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, user => {
    callback({
      email: user && user.email ? user.email : '',
      canEdit: canEdit(user)
    });
  });
}

window.ulamApi = {
  getAppData,
  saveDish,
  deleteDish,
  signInEditor,
  signOutEditor: () => signOut(auth),
  subscribeToAuth
};
