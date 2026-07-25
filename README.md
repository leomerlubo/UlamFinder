# Pinoy Ulam Finder

Vercel frontend with Firebase Authentication and Cloud Firestore.

## Firebase setup

1. Create a Firebase web app.
2. Create a Cloud Firestore database.
3. Enable Google authentication in Firebase Authentication.
4. Deploy `firestore.rules` with the Firebase CLI.
5. Copy `.env.example` to `.env.local` and enter the Firebase web app values.

## Local development

```bash
npm install
npm run dev
```

## Vercel deployment

Import this repository into Vercel and add every variable from `.env.example` under Project Settings, Environment Variables.

The build command is `npm run build` and the output directory is `dist`.

## Firestore structure

Dish documents are stored in the `dishes` collection. Each document contains:

* `dishName`
* `variants`
* `mainCategories`
* `mainIngredients`
* `subIngredients`
* `description`
* `recipeGuideline`
* `cookingInstructions`
* `createdAt`
* `updatedAt`

`variants` is an array of complete versions of the shared dish. Each variant
contains its own `name`, `mainCategory`, `mainIngredients`, `subIngredients`,
`description`, `recipeGuideline`, and `cookingInstructions`. The aggregate
fields remain in each document for compatibility with older saved dishes.

Public visitors can browse dishes. Configure the approved editor accounts privately in the Firebase console. The repository rules deny writes until that private rule is published.
