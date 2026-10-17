import type {
  FindableObject,
  ImageAttribution,
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
  imageUrl?: string,
): FindableObject {
  return {
    id,
    name,
    category,
    difficulty,
    emoji,
    unicodeHex,
    flatSvgUrl: imageUrl ?? fluentFlatSvgUrl(iconName),
    examples,
  };
}

const UF_LANDMARK_PHOTOS: Record<string, { url: string; attribution: ImageAttribution }> = {
  "century-tower": {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Century_Tower_%28University_of_Florida%29.jpg/960px-Century_Tower_%28University_of_Florida%29.jpg",
    attribution: {
      author: "Kate Haskell",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Century_Tower_(University_of_Florida).jpg",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    },
  },
  "french-fries-sculpture": {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Dsg_UF_French_Fries_Sculpture_20050507.jpg/960px-Dsg_UF_French_Fries_Sculpture_20050507.jpg",
    attribution: {
      author: "Douglas Green",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dsg_UF_French_Fries_Sculpture_20050507.jpg",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    },
  },
  "turlington-rock": {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/UF_TurlingtonRock.jpg/960px-UF_TurlingtonRock.jpg",
    attribution: {
      author: "WillMcC",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:UF_TurlingtonRock.jpg",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
  },
};

const campusLandmarks = [
  ["century-tower", "Century Tower", "MEDIUM", "🕰️", "clock", "Century Tower, bell tower, UF carillon, tall clock tower on campus", UF_LANDMARK_PHOTOS["century-tower"].url],
  ["french-fries-sculpture", "French Fries Sculpture", "MEDIUM", "✨", "sparkles", "French Fries sculpture, yellow art sculpture, Marston sculpture, modern art on campus", UF_LANDMARK_PHOTOS["french-fries-sculpture"].url],
  ["blue-light-emergency-box", "Blue Light Emergency Box", "EASY", "🛡️", "telephone", "blue light emergency phone pole, campus safety phone, emergency call box"],
  ["bull-gator-statue", "Bull Gator Statue", "HARD", "🐊", "crocodile", "Bull Gator statue, bronze gator, stadium gator statue, giant alligator sculpture"],
  ["turlington-rock", "Turlington Hall Rock", "HARD", "🪨", "mountain", "Turlington rock, the potato, limestone boulder, the giant rock in Turlington Plaza", UF_LANDMARK_PHOTOS["turlington-rock"].url],
  ["gator-id-card", "Gator 1 Card", "EASY", "🪪", "identification-card", "Gator 1 card, student ID, UF ID, campus badge, ID card"],
  ["gator-gear", "Orange or Blue Gator Gear", "EASY", "🎨", "t-shirt", "orange shirt, blue hoodie, Gator apparel, UF colors clothing"],
] as const;

const hackathonObjects = [
  ["headphones", "Headphones", "EASY", "🎧", "headphone", "over-ear headphones, earbuds, AirPods, wired earphones"],
  ["laptop-charger", "Laptop Charger", "MEDIUM", "🔌", "electric-plug", "laptop power brick, MagSafe cable, USB-C laptop charger"],
  ["backpack", "Backpack", "EASY", "🎒", "backpack", "bookbag, hiking pack, laptop backpack, drawstring bag"],
  ["sneaker", "Sneaker", "EASY", "👟", "running-shoe", "running shoe, tennis shoe, trainer, canvas sneaker"],
  ["eyeglasses", "Eyeglasses", "EASY", "👓", "glasses", "prescription glasses, frames, reading glasses, clear lenses"],
  ["hoodie", "Hoodie", "EASY", "🧥", "coat", "hoodie, zip-up jacket, sweatshirt, windbreaker"],
  ["keys", "Keys", "EASY", "🔑", "key", "house keys, car keys, keychain, fob with keys"],
  ["pen", "Pen", "EASY", "🖊️", "pen", "ballpoint pen, Sharpie, gel pen, mechanical pencil"],
  ["notebook", "Notebook", "EASY", "📓", "notebook", "spiral notebook, composition book, legal pad, journal"],
  ["wristwatch", "Wristwatch", "MEDIUM", "⌚", "watch", "analog watch, smartwatch, Apple Watch, digital watch"],
  ["computer-mouse", "Computer Mouse", "EASY", "🖱️", "computer-mouse", "wired mouse, wireless mouse, trackball, gaming mouse"],
  ["id-card", "ID Card", "MEDIUM", "🪪", "identification-card", "Gator 1 card, student ID, badge, driver's license"],
  ["baseball-cap", "Baseball Cap", "EASY", "🧢", "billed-cap", "baseball cap, dad hat, snapback, trucker hat"],
  ["coffee-mug", "Coffee Mug", "EASY", "☕", "hot-beverage", "ceramic mug, travel tumbler, teacup, paper coffee cup"],
  ["sticker", "Sticker", "MEDIUM", "🏷️", "label", "laptop sticker, vinyl sticker, name tag sticker, badge sticker"],
  ["tissue", "Tissue", "EASY", "🧻", "roll-of-paper", "tissue, napkin, paper towel, Kleenex"],
  ["chair", "Chair", "EASY", "🪑", "chair", "desk chair, folding chair, stool, campus seating"],
  ["coin", "Coin", "MEDIUM", "🪙", "coin", "quarter, penny, dime, any metal coin"],
  ["wallet", "Wallet", "MEDIUM", "👛", "purse", "bifold wallet, cardholder, money clip, zip wallet"],
  ["laptop", "Laptop", "EASY", "💻", "laptop", "notebook computer, MacBook, Chromebook, Windows laptop"],
  ["smartphone", "Smartphone", "EASY", "📱", "mobile-phone", "iPhone, Android phone, cellphone, smartphone"],
  ["keyboard", "Keyboard", "EASY", "⌨️", "keyboard", "laptop keyboard, mechanical keyboard, wireless keyboard"],
  ["clipboard", "Clipboard", "MEDIUM", "📋", "clipboard", "office clipboard, check-in board, plastic clipboard"],
  ["sticky-notes", "Sticky Notes", "MEDIUM", "🗒️", "spiral-notepad", "Post-it notes, sticky pad, memo notes"],
  ["t-shirt", "T-Shirt", "EASY", "👕", "t-shirt", "tee, hackathon shirt, crew neck, graphic tee"],
  ["jeans", "Jeans", "EASY", "👖", "jeans", "denim jeans, pants, trousers, joggers"],
  ["pencil", "Pencil", "EASY", "✏️", "pencil", "wooden pencil, mechanical pencil, golf pencil"],
  ["name-badge", "Name Badge", "MEDIUM", "📛", "name-badge", "hackathon badge, lanyard badge, event pass, sticker nametag"],
] as const;

const householdItems = [
  ["hammer", "Hammer", "EASY", "🔨", "hammer", "claw hammer, sledgehammer, ball-peen hammer, rubber mallet"],
  ["spoon", "Spoon", "EASY", "🥄", "spoon", "teaspoon, tablespoon, soup spoon, plastic spoon"],
  ["fork", "Fork", "EASY", "🍴", "fork-and-knife", "dinner fork, plastic fork, salad fork"],
  ["toothbrush", "Toothbrush", "EASY", "🪥", "toothbrush", "manual toothbrush, electric toothbrush, travel toothbrush"],
  ["scissors", "Scissors", "EASY", "✂️", "scissors", "kitchen scissors, office shears, safety scissors"],
  ["book", "Book", "EASY", "📖", "open-book", "hardcover, paperback, textbook, cookbook"],
  ["banana", "Banana", "EASY", "🍌", "banana", "yellow banana, bunch of bananas, banana with spots"],
  ["apple", "Apple", "EASY", "🍎", "red-apple", "red apple, green apple, real fruit — not an Apple logo"],
  ["sock", "Sock", "EASY", "🧦", "socks", "ankle sock, crew sock, athletic sock, fuzzy sock"],
  ["umbrella", "Umbrella", "MEDIUM", "☂️", "umbrella", "rain umbrella, compact umbrella, golf umbrella"],
  ["screwdriver", "Screwdriver", "MEDIUM", "🪛", "screwdriver", "Phillips screwdriver, flathead, multi-bit driver"],
  ["houseplant", "Houseplant", "MEDIUM", "🪴", "potted-plant", "potted plant, succulent, desk plant, hanging plant"],
  ["bowl", "Bowl", "EASY", "🥣", "bowl-with-spoon", "cereal bowl, mixing bowl, soup bowl"],
  ["flashlight", "Flashlight", "MEDIUM", "🔦", "flashlight", "handheld flashlight, headlamp, phone flashlight is a stretch — prefer a real torch"],
  ["comb", "Comb", "MEDIUM", "🪮", "hair-pick", "comb, hairbrush, pick, detangling brush"],
  ["sponge", "Sponge", "EASY", "🧽", "sponge", "kitchen sponge, dish sponge, scrubber"],
  ["frying-pan", "Frying Pan", "EASY", "🍳", "cooking", "skillet, saute pan, nonstick pan, cast iron pan"],
  ["plate", "Plate", "EASY", "🍽️", "fork-and-knife-with-plate", "dinner plate, paper plate, saucer"],
  ["paperclip", "Paperclip", "EASY", "📎", "paperclip", "metal paperclip, binder clip is close enough"],
  ["trash-can", "Trash Can", "EASY", "🗑️", "wastebasket", "wastebasket, garbage bin, recycling bin"],
  ["mirror", "Mirror", "MEDIUM", "🪞", "mirror", "handheld mirror, wall mirror, compact mirror"],
  ["lightbulb", "Lightbulb", "MEDIUM", "💡", "light-bulb", "LED bulb, incandescent bulb, loose lightbulb"],
  ["broom", "Broom", "EASY", "🧹", "broom", "push broom, dustpan broom, witch-style broom"],
  ["soap", "Soap", "EASY", "🧼", "soap", "bar soap, liquid hand soap, soap dispenser"],
  ["bucket", "Bucket", "EASY", "🪣", "bucket", "plastic bucket, mop bucket, cleaning pail"],
  ["door", "Door", "EASY", "🚪", "door", "interior door, closet door, fridge door is too much of a stretch"],
  ["window", "Window", "MEDIUM", "🪟", "window", "room window, window pane, window with blinds"],
  ["kitchen-knife", "Kitchen Knife", "MEDIUM", "🔪", "kitchen-knife", "chef's knife, butter knife, steak knife — not a weapon photo"],
  ["teapot", "Teapot", "MEDIUM", "🫖", "teapot", "kettle, stovetop teapot, electric kettle"],
  ["salt", "Salt", "EASY", "🧂", "salt", "salt shaker, salt cellar, kosher salt box"],
  ["candle", "Candle", "MEDIUM", "🕯️", "candle", "pillar candle, tea light, jar candle"],
  ["alarm-clock", "Alarm Clock", "EASY", "⏰", "alarm-clock", "bedside alarm, analog clock, digital alarm"],
  ["wrench", "Wrench", "MEDIUM", "🔧", "wrench", "adjustable wrench, box wrench, socket wrench"],
  ["nut-and-bolt", "Nut and Bolt", "HARD", "🔩", "nut-and-bolt", "hex bolt, screw with nut, hardware fastener"],
  ["ladder", "Ladder", "HARD", "🪜", "ladder", "step ladder, folding ladder, stool ladder"],
  ["plunger", "Plunger", "MEDIUM", "🪠", "plunger", "toilet plunger, sink plunger"],
  ["shopping-bag", "Shopping Bag", "EASY", "🛍️", "shopping-bags", "plastic bag, paper grocery bag, tote bag"],
  ["laundry-basket", "Laundry Basket", "EASY", "🧺", "basket", "hamper, laundry bin, wicker basket"],
  ["gloves", "Gloves", "MEDIUM", "🧤", "gloves", "winter gloves, work gloves, rubber dish gloves"],
  ["scarf", "Scarf", "MEDIUM", "🧣", "scarf", "winter scarf, neck wrap, knit scarf"],
  ["lipstick", "Lipstick", "MEDIUM", "💄", "lipstick", "lipstick tube, lip balm, chapstick"],
  ["razor", "Razor", "MEDIUM", "🪒", "razor", "disposable razor, cartridge razor, electric shaver"],
  ["orange", "Orange", "EASY", "🍊", "tangerine", "orange fruit, tangerine, clementine"],
  ["carrot", "Carrot", "EASY", "🥕", "carrot", "whole carrot, baby carrots, carrot sticks"],
  ["bread", "Bread", "EASY", "🍞", "bread", "sliced loaf, baguette, dinner roll"],
  ["cheese", "Cheese", "EASY", "🧀", "cheese-wedge", "cheese slice, cheese block, shredded cheese bag"],
] as const;

const extraCampusAndEverydayItems = [
  ["water-bottle", "Water Bottle", "EASY", "💧", "water", "hydro flask, reusable bottle, metal water bottle, sports bottle"],
  ["phone-case", "Phone Case", "EASY", "📲", "mobile-phone", "phone case, smartphone case, silicone shell, protective case"],
  ["usb-cable", "USB Cable", "EASY", "🔋", "electric-plug", "charging cable, USB cord, lightning cable, data cable"],
  ["mug", "Mug", "EASY", "☕", "hot-beverage", "coffee mug, ceramic mug, tea mug, travel cup"],
  ["lotion", "Lotion", "MEDIUM", "🧴", "bottle", "hand lotion, moisturizer, body lotion, skincare bottle"],
  ["marker", "Marker", "EASY", "🖍️", "pencil", "dry erase marker, permanent marker, whiteboard marker"],
  ["planner", "Planner", "EASY", "📒", "notebook", "planner, agenda, organizer, notebook planner"],
  ["microphone", "Microphone", "MEDIUM", "🎤", "microphone", "USB mic, podcast mic, headset mic, stage microphone"],
  ["desk-lamp", "Desk Lamp", "EASY", "💡", "light-bulb", "desk lamp, study lamp, desk light, bedside reading lamp"],
  ["usb-drive", "USB Drive", "EASY", "💾", "computer-mouse", "USB stick, flash drive, thumb drive, memory stick"],
  ["mousepad", "Mouse Pad", "EASY", "🖱️", "computer-mouse", "mouse pad, gaming mat, desk pad, large mouse surface"],
  ["calendar", "Calendar", "EASY", "🗓️", "calendar", "wall calendar, desk calendar, monthly planner, dated organizer"],
  ["power-bank", "Power Bank", "MEDIUM", "🔋", "battery", "power bank, phone battery, charging pack, external battery"],
  ["wallet-card", "Credit Card", "EASY", "💳", "credit-card", "credit card, debit card, bank card, payment card"],
  ["sunglasses", "Sunglasses", "EASY", "🕶️", "glasses", "sunglasses, prescription shades, tinted glasses"],
  ["hat", "Hat", "EASY", "🧢", "billed-cap", "cap, beanie, baseball cap, sun hat"],
  ["sandal", "Sandal", "EASY", "🩴", "shoe", "flip flop, sandal, slides, beach sandal"],
  ["backpack-strap", "Backpack Strap", "MEDIUM", "🎒", "backpack", "backpack strap, shoulder strap, shoulder bag strap"],
  ["shoe-laces", "Shoelaces", "EASY", "👟", "running-shoe", "shoelaces, laces, sneaker strings, shoe string"],
  ["desk-organizer", "Desk Organizer", "EASY", "🗃️", "card-file-box", "desk tray, organizer, pen cup, storage tray"],
  ["pillow", "Pillow", "EASY", "🛏️", "bed", "pillow, couch pillow, throw pillow, cushion"],
  ["blanket", "Blanket", "EASY", "🧣", "scarf", "blanket, throw, bedspread, quilt"],
  ["socks-pair", "Sock Pair", "EASY", "🧦", "socks", "sock pair, clean socks, folded socks, daily socks"],
  ["hair-tie", "Hair Tie", "EASY", "🎀", "ribbon", "hair tie, elastic band, ponytail holder, scrunchie"],
  ["lip-balm", "Lip Balm", "EASY", "🫧", "lipstick", "lip balm, chapstick, lip product, lip salve"],
  ["spray-bottle", "Spray Bottle", "MEDIUM", "🧴", "bottle", "spray bottle, cleaning spray, disinfectant spray"],
  ["charging-pad", "Charging Pad", "EASY", "🔌", "electric-plug", "charging pad, wireless charger, induction pad, power mat"],
  ["camera", "Camera", "MEDIUM", "📷", "camera", "digital camera, point-and-shoot, mirrorless camera"],
  ["tablet", "Tablet", "EASY", "📱", "mobile-phone", "tablet, iPad, e-reader, touchscreen pad"],
  ["headset", "Headset", "EASY", "🎧", "headphone", "gaming headset, USB headset, stereo headset"],
  ["keyboard-shortcut", "Keyboard Shortcut Sheet", "MEDIUM", "⌨️", "keyboard", "shortcut sheet, cheat sheet, keyboard legend"],
  ["coffee-cup", "Coffee Cup", "EASY", "☕", "hot-beverage", "paper coffee cup, iced coffee, latte cup"],
  ["folder", "Folder", "EASY", "📁", "file-folder", "binder folder, document folder, class folder"],
  ["binder", "Binder", "EASY", "🗂️", "card-file-box", "binder, office binder, clip folder, ring binder"],
  ["soda-can", "Soda Can", "EASY", "🥤", "can", "soda can, energy drink, canned drink, soft drink"],
  ["thermos", "Thermos", "MEDIUM", "🧊", "snowflake", "thermos, travel flask, insulated bottle, vacuum bottle"],
  ["cushion", "Cushion", "EASY", "🛋️", "couch", "cushion, throw cushion, sofa pillow, cushion pad"],
  ["remote", "TV Remote", "MEDIUM", "📺", "tv", "remote control, TV remote, handheld remote, clicker"],
  ["airpods", "AirPods", "EASY", "🎧", "headphone", "airpods, wireless earbuds, earbuds, apple earbuds"],
  ["coffee-bean", "Coffee Bean", "EASY", "☕", "hot-beverage", "coffee bean, espresso bean, roasted bean"],
  ["whiteboard", "Whiteboard", "MEDIUM", "📝", "notebook", "whiteboard, dry erase board, marker board"],
  ["tv-screen", "TV Screen", "MEDIUM", "📺", "tv", "television screen, monitor, screen, display"],
  ["printer", "Printer", "MEDIUM", "🖨️", "printer", "printer, office printer, laser printer, inkjet"],
  ["speaker", "Speaker", "MEDIUM", "🔊", "speaker", "speaker, bluetooth speaker, desktop speaker"],
  ["keyboard-dock", "Keyboard Dock", "MEDIUM", "⌨️", "keyboard", "keyboard dock, tablet keyboard, laptop dock"],
  ["fan", "Fan", "MEDIUM", "🌀", "wind", "desk fan, ceiling fan, portable fan, oscillating fan"],
  ["usb-hub", "USB Hub", "EASY", "🔌", "electric-plug", "USB hub, dock, adapter, extension hub"],
  ["screw", "Screw", "MEDIUM", "🔩", "nut-and-bolt", "screw, machine screw, metal screw, fastener"],
  ["paintbrush", "Paintbrush", "MEDIUM", "🎨", "paint-palette", "paintbrush, artist brush, acrylic brush"],
  ["gluestick", "Glue Stick", "EASY", "🩹", "stick", "glue stick, craft glue, hot glue stick"],
  ["stapler", "Stapler", "EASY", "📎", "paperclip", "stapler, office stapler, desk stapler"],
  ["tape", "Tape", "EASY", "📏", "ruler", "tape roll, masking tape, adhesive tape"],
  ["ruler", "Ruler", "EASY", "📏", "ruler", "ruler, measuring stick, straightedge"],
  ["eraser", "Eraser", "EASY", "🧽", "sponge", "eraser, gum eraser, white eraser"],
  ["pencil-case", "Pencil Case", "EASY", "✏️", "pencil", "pencil case, pencil pouch, utensil pouch"],
  ["phone-charger", "Phone Charger", "EASY", "🔌", "electric-plug", "phone charger, wall charger, mobile charger"],
  ["laptop-stand", "Laptop Stand", "MEDIUM", "💻", "laptop", "laptop stand, book stand, tablet stand"],
  ["mini-fan", "Mini Fan", "MEDIUM", "🌀", "wind", "mini fan, handheld fan, portable fan"],
  ["safety-pin", "Safety Pin", "EASY", "📍", "pin", "safety pin, sewing pin, clothing pin"],
  ["chair-cushion", "Chair Cushion", "EASY", "🪑", "chair", "chair cushion, seat cushion, office cushion"],
  ["desktop-cleaner", "Desktop Cleaner", "MEDIUM", "🧽", "sponge", "screen cleaner, microfiber cloth, laptop cleaner"],
  ["keychain", "Keychain", "EASY", "🔑", "key", "keychain, ring fob, key holder"],
  ["coffee-table-book", "Coffee Table Book", "EASY", "📚", "open-book", "coffee table book, art book, photo book"],
  ["bottle-cap", "Bottle Cap", "EASY", "🧴", "bottle", "bottle cap, screw cap, soda cap"],
  ["chess-board", "Chess Board", "MEDIUM", "♟️", "chess-pawn", "chessboard, game board, checkers board"],
] as const;

const itemSpecs = [
  ...campusLandmarks,
  ...hackathonObjects,
  ...householdItems,
  ...extraCampusAndEverydayItems,
] as const;

/**
 * Expanded pool designed for long-form play: a large, mixed set of campus,
 * household, personal, and hackathon-friendly objects with photo-backed targets
 * for real-world landmarks when available.
 */
export const OBJECT_POOL: FindableObject[] = itemSpecs.map(([id, name, difficulty, emoji, iconName, examples, imageUrl]) => {
  const object = item(
    id as string,
    name as string,
    id.includes("tower") || id.includes("statue") || id.includes("rock") || id.includes("gator") || id.includes("emergency") ? "HACKATHON_CAMPUS" : "HOUSEHOLD",
    difficulty as ObjectDifficulty,
    emoji as string,
    "0000",
    iconName as string,
    examples as string,
    imageUrl as string | undefined,
  );
  return {
    ...object,
    imageAttribution: UF_LANDMARK_PHOTOS[id as string]?.attribution,
  };
});

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
