// The shop's products. The shop page and the checkout both read this list, and prices only ever come from here,
// never from the browser. Add one entry per product (or send Claude the details and it will add them):
//
//   {
//     id: 'dz-tee-black',            // short, unique, lowercase
//     name: 'DEPARTURZ Tee, Black',   // what the customer sees
//     kind: 'physical',               // 'physical' ships (Stripe asks for an address); 'digital' unlocks a download
//     price: 45,                      // in US dollars
//     images: ['shop/dz-tee-black-1.webp', 'shop/dz-tee-black-2.webp'],   // files in the site's shop folder
//     sizes: ['S', 'M', 'L', 'XL'],   // optional
//     blurb: 'Heavyweight cotton, embroidered mark.',
//     drop: 'Drop 01',                // optional label on the card
//     soldOut: false,                 // true shows it but stops sales
//     deliver: ''                     // digital only: the private share link (Google Drive, Dropbox) buyers get after paying
//   }
//
export const PRODUCTS = [];

// Shipping for physical orders, in US dollars. Set price before the first physical product goes on sale;
// freeOver gives free shipping above that order total (leave null for none).
export const SHIPPING = { label: 'Standard shipping', price: null, freeOver: null, countries: ['US'] };

// what the shop page shows itself (no prices, no delivery links)
export const publicCatalog = () => PRODUCTS.map(p => ({
  id: p.id, name: p.name, kind: p.kind, price: p.price, images: p.images || [], sizes: p.sizes || [],
  blurb: p.blurb || '', drop: p.drop || '', soldOut: !!p.soldOut
}));
