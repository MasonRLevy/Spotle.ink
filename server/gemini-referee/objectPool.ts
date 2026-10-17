import type {
  FindableObject,
  ObjectCategory,
  ObjectDifficulty,
  RandomObjectOptions,
} from "./types.js";

const FLUENT_CDN =
  "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@latest/assets";

/** Microsoft folders are sentence case: "Computer mouse", "T-shirt". */
function fluentFolderName(iconName: string): string {
  if (iconName === "t-shirt") return "T-shirt";
  const [first = "", ...rest] = iconName.split("-");
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

function fluentFlatSvgUrl(iconName: string): string {
  const folder = encodeURIComponent(fluentFolderName(iconName));
  const file =
    iconName === "t-shirt"
      ? "t-shirt_flat.svg"
      : `${iconName.replace(/-/g, "_")}_flat.svg`;
  return `${FLUENT_CDN}/${folder}/Flat/${file}`;
}

function item(
  id: string,
  name: string,
  category: ObjectCategory,
  difficulty: ObjectDifficulty,
  emoji: string,
  unicodeHex: string,
  iconName: string,
  examples: string,
): FindableObject {
  return {
    id,
    name,
    category,
    difficulty,
    emoji,
    unicodeHex,
    flatSvgUrl: fluentFlatSvgUrl(iconName),
    examples,
  };
}

/**
 * Curated zero-latency pool of physically findable objects.
 * Icons: Microsoft Fluent UI Emoji Flat SVG via Iconify CDN.
 */
export const OBJECT_POOL: FindableObject[] = [
  // --- UF CAMPUS LANDMARKS & CAMPUS ITEMS ---
  item("century-tower", "Century Tower", "HACKATHON_CAMPUS", "MEDIUM", "🕰️", "1f570", "clock", "Century Tower, bell tower, UF carillon, tall clock tower on campus"),
  item("french-fries-sculpture", "French Fries Sculpture", "HACKATHON_CAMPUS", "MEDIUM", "✨", "2728", "sparkles", "French Fries sculpture, yellow art sculpture, Marston sculpture, modern art on campus"),
  item("blue-light-emergency-box", "Blue Light Emergency Box", "HACKATHON_CAMPUS", "EASY", "🛡️", "1f6e1", "shield", "blue light emergency box, campus safety box, emergency call box, blue light pole"),
  item("bull-gator-statue", "Bull Gator Statue", "HACKATHON_CAMPUS", "HARD", "🐊", "1f9a6", "mountain", "Bull Gator statue, bronze gator, stadium gator statue, giant lizard statue"),
  item("turlington-rock", "Turlington Hall Rock", "HACKATHON_CAMPUS", "HARD", "🪨", "1faa8", "mountain", "Turlington rock, the potato, limestone boulder, the giant rock in Turlington Plaza"),
  item("gator-id-card", "Gator 1 Card", "HACKATHON_CAMPUS", "EASY", "🪪", "1faaa", "identification-card", "Gator 1 card, student ID, UF ID, campus badge, ID card"),
  item("gator-gear", "Orange or Blue Gator Gear", "HACKATHON_CAMPUS", "EASY", "🎨", "1f3a8", "paint-palette", "orange shirt, blue hoodie, Gator apparel, UF colors clothing"),

  // --- HACKATHON / CAMPUS (28) ---
  item("headphones", "Headphones", "HACKATHON_CAMPUS", "EASY", "🎧", "1f3a7", "headphone", "over-ear headphones, earbuds, AirPods, wired earphones"),
  item("laptop-charger", "Laptop Charger", "HACKATHON_CAMPUS", "MEDIUM", "🔌", "1f50c", "electric-plug", "laptop power brick, MagSafe cable, USB-C laptop charger"),
  item("backpack", "Backpack", "HACKATHON_CAMPUS", "EASY", "🎒", "1f392", "backpack", "bookbag, hiking pack, laptop backpack, drawstring bag"),
  item("sneaker", "Sneaker", "HACKATHON_CAMPUS", "EASY", "👟", "1f45f", "running-shoe", "running shoe, tennis shoe, trainer, canvas sneaker"),
  item("eyeglasses", "Eyeglasses", "HACKATHON_CAMPUS", "EASY", "👓", "1f453", "glasses", "prescription glasses, frames, reading glasses, clear lenses"),
  item("hoodie", "Hoodie", "HACKATHON_CAMPUS", "EASY", "🧥", "1f9e5", "coat", "hoodie, zip-up jacket, sweatshirt, windbreaker"),
  item("keys", "Keys", "HACKATHON_CAMPUS", "EASY", "🔑", "1f511", "key", "house keys, car keys, keychain, fob with keys"),
  item("pen", "Pen", "HACKATHON_CAMPUS", "EASY", "🖊️", "1f58a", "pen", "ballpoint pen, Sharpie, gel pen, mechanical pencil"),
  item("notebook", "Notebook", "HACKATHON_CAMPUS", "EASY", "📓", "1f4d3", "notebook", "spiral notebook, composition book, legal pad, journal"),
  item("wristwatch", "Wristwatch", "HACKATHON_CAMPUS", "MEDIUM", "⌚", "231a", "watch", "analog watch, smartwatch, Apple Watch, digital watch"),
  item("computer-mouse", "Computer Mouse", "HACKATHON_CAMPUS", "EASY", "🖱️", "1f5b1", "computer-mouse", "wired mouse, wireless mouse, trackball, gaming mouse"),
  item("id-card", "ID Card", "HACKATHON_CAMPUS", "MEDIUM", "🪪", "1faaa", "identification-card", "Gator 1 card, student ID, badge, driver's license"),
  item("baseball-cap", "Baseball Cap", "HACKATHON_CAMPUS", "EASY", "🧢", "1f9e2", "billed-cap", "baseball cap, dad hat, snapback, trucker hat"),
  item("coffee-mug", "Coffee Mug", "HACKATHON_CAMPUS", "EASY", "☕", "2615", "hot-beverage", "ceramic mug, travel tumbler, teacup, paper coffee cup"),
  item("sticker", "Sticker", "HACKATHON_CAMPUS", "MEDIUM", "🏷️", "1f3f7", "label", "laptop sticker, vinyl sticker, name tag sticker, badge sticker"),
  item("tissue", "Tissue", "HACKATHON_CAMPUS", "EASY", "🧻", "1f9fb", "roll-of-paper", "tissue, napkin, paper towel, Kleenex"),
  item("chair", "Chair", "HACKATHON_CAMPUS", "EASY", "🪑", "1fa91", "chair", "desk chair, folding chair, stool, campus seating"),
  item("coin", "Coin", "HACKATHON_CAMPUS", "MEDIUM", "🪙", "1fa99", "coin", "quarter, penny, dime, any metal coin"),
  item("wallet", "Wallet", "HACKATHON_CAMPUS", "MEDIUM", "👛", "1f45b", "purse", "bifold wallet, cardholder, money clip, zip wallet"),
  item("laptop", "Laptop", "HACKATHON_CAMPUS", "EASY", "💻", "1f4bb", "laptop", "notebook computer, MacBook, Chromebook, Windows laptop"),
  item("smartphone", "Smartphone", "HACKATHON_CAMPUS", "EASY", "📱", "1f4f1", "mobile-phone", "iPhone, Android phone, cellphone, smartphone"),
  item("keyboard", "Keyboard", "HACKATHON_CAMPUS", "EASY", "⌨️", "2328", "keyboard", "laptop keyboard, mechanical keyboard, wireless keyboard"),
  item("clipboard", "Clipboard", "HACKATHON_CAMPUS", "MEDIUM", "📋", "1f4cb", "clipboard", "office clipboard, check-in board, plastic clipboard"),
  item("sticky-notes", "Sticky Notes", "HACKATHON_CAMPUS", "MEDIUM", "🗒️", "1f5d2", "spiral-notepad", "Post-it notes, sticky pad, memo notes"),
  item("t-shirt", "T-Shirt", "HACKATHON_CAMPUS", "EASY", "👕", "1f455", "t-shirt", "tee, hackathon shirt, crew neck, graphic tee"),
  item("jeans", "Jeans", "HACKATHON_CAMPUS", "EASY", "👖", "1f456", "jeans", "denim jeans, pants, trousers, joggers"),
  item("pencil", "Pencil", "HACKATHON_CAMPUS", "EASY", "✏️", "270f", "pencil", "wooden pencil, mechanical pencil, golf pencil"),
  item("name-badge", "Name Badge", "HACKATHON_CAMPUS", "MEDIUM", "📛", "1f4db", "name-badge", "hackathon badge, lanyard badge, event pass, sticker nametag"),

  // --- HOUSEHOLD (46) ---
  item("hammer", "Hammer", "HOUSEHOLD", "EASY", "🔨", "1f528", "hammer", "claw hammer, sledgehammer, ball-peen hammer, rubber mallet"),
  item("spoon", "Spoon", "HOUSEHOLD", "EASY", "🥄", "1f944", "spoon", "teaspoon, tablespoon, soup spoon, plastic spoon"),
  item("fork", "Fork", "HOUSEHOLD", "EASY", "🍴", "1f374", "fork-and-knife", "dinner fork, plastic fork, salad fork"),
  item("toothbrush", "Toothbrush", "HOUSEHOLD", "EASY", "🪥", "1faa5", "toothbrush", "manual toothbrush, electric toothbrush, travel toothbrush"),
  item("scissors", "Scissors", "HOUSEHOLD", "EASY", "✂️", "2702", "scissors", "kitchen scissors, office shears, safety scissors"),
  item("book", "Book", "HOUSEHOLD", "EASY", "📖", "1f4d6", "open-book", "hardcover, paperback, textbook, cookbook"),
  item("banana", "Banana", "HOUSEHOLD", "EASY", "🍌", "1f34c", "banana", "yellow banana, bunch of bananas, banana with spots"),
  item("apple", "Apple", "HOUSEHOLD", "EASY", "🍎", "1f34e", "red-apple", "red apple, green apple, real fruit — not an Apple logo"),
  item("sock", "Sock", "HOUSEHOLD", "EASY", "🧦", "1f9e6", "socks", "ankle sock, crew sock, athletic sock, fuzzy sock"),
  item("umbrella", "Umbrella", "HOUSEHOLD", "MEDIUM", "☂️", "2602", "umbrella", "rain umbrella, compact umbrella, golf umbrella"),
  item("screwdriver", "Screwdriver", "HOUSEHOLD", "MEDIUM", "🪛", "1fa9b", "screwdriver", "Phillips screwdriver, flathead, multi-bit driver"),
  item("houseplant", "Houseplant", "HOUSEHOLD", "MEDIUM", "🪴", "1fab4", "potted-plant", "potted plant, succulent, desk plant, hanging plant"),
  item("bowl", "Bowl", "HOUSEHOLD", "EASY", "🥣", "1f963", "bowl-with-spoon", "cereal bowl, mixing bowl, soup bowl"),
  item("flashlight", "Flashlight", "HOUSEHOLD", "MEDIUM", "🔦", "1f526", "flashlight", "handheld flashlight, headlamp, phone flashlight is a stretch — prefer a real torch"),
  item("comb", "Comb", "HOUSEHOLD", "MEDIUM", "🪮", "1faae", "hair-pick", "comb, hairbrush, pick, detangling brush"),
  item("sponge", "Sponge", "HOUSEHOLD", "EASY", "🧽", "1f9fd", "sponge", "kitchen sponge, dish sponge, scrubber"),
  item("frying-pan", "Frying Pan", "HOUSEHOLD", "EASY", "🍳", "1f373", "cooking", "skillet, saute pan, nonstick pan, cast iron pan"),
  item("plate", "Plate", "HOUSEHOLD", "EASY", "🍽️", "1f37d", "fork-and-knife-with-plate", "dinner plate, paper plate, saucer"),
  item("paperclip", "Paperclip", "HOUSEHOLD", "EASY", "📎", "1f4ce", "paperclip", "metal paperclip, binder clip is close enough"),
  item("trash-can", "Trash Can", "HOUSEHOLD", "EASY", "🗑️", "1f5d1", "wastebasket", "wastebasket, garbage bin, recycling bin"),
  item("mirror", "Mirror", "HOUSEHOLD", "MEDIUM", "🪞", "1fa9e", "mirror", "handheld mirror, wall mirror, compact mirror"),
  item("lightbulb", "Lightbulb", "HOUSEHOLD", "MEDIUM", "💡", "1f4a1", "light-bulb", "LED bulb, incandescent bulb, loose lightbulb"),
  item("broom", "Broom", "HOUSEHOLD", "EASY", "🧹", "1f9f9", "broom", "push broom, dustpan broom, witch-style broom"),
  item("soap", "Soap", "HOUSEHOLD", "EASY", "🧼", "1f9fc", "soap", "bar soap, liquid hand soap, soap dispenser"),
  item("bucket", "Bucket", "HOUSEHOLD", "EASY", "🪣", "1faa3", "bucket", "plastic bucket, mop bucket, cleaning pail"),
  item("door", "Door", "HOUSEHOLD", "EASY", "🚪", "1f6aa", "door", "interior door, closet door, fridge door is too much of a stretch"),
  item("window", "Window", "HOUSEHOLD", "MEDIUM", "🪟", "1fa9f", "window", "room window, window pane, window with blinds"),
  item("kitchen-knife", "Kitchen Knife", "HOUSEHOLD", "MEDIUM", "🔪", "1f52a", "kitchen-knife", "chef's knife, butter knife, steak knife — not a weapon photo"),
  item("teapot", "Teapot", "HOUSEHOLD", "MEDIUM", "🫖", "1fad6", "teapot", "kettle, stovetop teapot, electric kettle"),
  item("salt", "Salt", "HOUSEHOLD", "EASY", "🧂", "1f9c2", "salt", "salt shaker, salt cellar, kosher salt box"),
  item("candle", "Candle", "HOUSEHOLD", "MEDIUM", "🕯️", "1f56f", "candle", "pillar candle, tea light, jar candle"),
  item("alarm-clock", "Alarm Clock", "HOUSEHOLD", "EASY", "⏰", "23f0", "alarm-clock", "bedside alarm, analog clock, digital alarm"),
  item("wrench", "Wrench", "HOUSEHOLD", "MEDIUM", "🔧", "1f527", "wrench", "adjustable wrench, box wrench, socket wrench"),
  item("nut-and-bolt", "Nut and Bolt", "HOUSEHOLD", "HARD", "🔩", "1f529", "nut-and-bolt", "hex bolt, screw with nut, hardware fastener"),
  item("ladder", "Ladder", "HOUSEHOLD", "HARD", "🪜", "1fa9c", "ladder", "step ladder, folding ladder, stool ladder"),
  item("plunger", "Plunger", "HOUSEHOLD", "MEDIUM", "🪠", "1faa0", "plunger", "toilet plunger, sink plunger"),
  item("shopping-bag", "Shopping Bag", "HOUSEHOLD", "EASY", "🛍️", "1f6cd", "shopping-bags", "plastic bag, paper grocery bag, tote bag"),
  item("laundry-basket", "Laundry Basket", "HOUSEHOLD", "EASY", "🧺", "1f9fa", "basket", "hamper, laundry bin, wicker basket"),
  item("gloves", "Gloves", "HOUSEHOLD", "MEDIUM", "🧤", "1f9e4", "gloves", "winter gloves, work gloves, rubber dish gloves"),
  item("scarf", "Scarf", "HOUSEHOLD", "MEDIUM", "🧣", "1f9e3", "scarf", "winter scarf, neck wrap, knit scarf"),
  item("lipstick", "Lipstick", "HOUSEHOLD", "MEDIUM", "💄", "1f484", "lipstick", "lipstick tube, lip balm, chapstick"),
  item("razor", "Razor", "HOUSEHOLD", "MEDIUM", "🪒", "1fa92", "razor", "disposable razor, cartridge razor, electric shaver"),
  item("orange", "Orange", "HOUSEHOLD", "EASY", "🍊", "1f34a", "tangerine", "orange fruit, tangerine, clementine"),
  item("carrot", "Carrot", "HOUSEHOLD", "EASY", "🥕", "1f955", "carrot", "whole carrot, baby carrots, carrot sticks"),
  item("bread", "Bread", "HOUSEHOLD", "EASY", "🍞", "1f35e", "bread", "sliced loaf, baguette, dinner roll"),
  item("cheese", "Cheese", "HOUSEHOLD", "EASY", "🧀", "1f9c0", "cheese-wedge", "cheese slice, cheese block, shredded cheese bag"),
];

export function getAllObjects(): FindableObject[] {
  return [...OBJECT_POOL];
}

export function getObjectById(id: string): FindableObject | undefined {
  return OBJECT_POOL.find((obj) => obj.id === id);
}

export function getRandomTargetObject(
  options: RandomObjectOptions = {},
): FindableObject | null {
  const category = options.category?.trim().toUpperCase();
  const difficulty = options.difficulty?.trim().toUpperCase();
  const exclude = new Set((options.excludeIds ?? []).filter(Boolean));

  const filtered = OBJECT_POOL.filter((obj) => {
    if (exclude.has(obj.id)) return false;
    if (category && category !== "ALL" && obj.category !== category) return false;
    if (difficulty && obj.difficulty !== difficulty) return false;
    return true;
  });

  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)] ?? null;
}
