/**
 * The product catalogue the mock adapter sells from.
 *
 * Real low-ticket dropshipping stock: the price points, the fee rates and the
 * cost ratios are what this business actually looks like, so the seeded numbers
 * reconcile the way a real month does rather than looking like lorem ipsum.
 *
 * costMinor is what the supplier charges; salePriceMinor is the eBay listing.
 */
export interface CatalogItem {
  sku: string;
  title: string;
  category: string;
  salePriceMinor: number;
  costMinor: number;
  supplier: string;
  /** Share of sales of this item that end in a refund. Drives the seeded refund mix. */
  refundRate: number;
  weight: number;
}

export const CATALOG: CatalogItem[] = [
  { sku: "DI-1042", title: "Protective Laptop Sleeve Case 13.3 14 15.6 16 Inch Slim Carrying Bag", category: "Computing", salePriceMinor: 1399, costMinor: 612, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.04, weight: 9 },
  { sku: "DI-2210", title: "925 Sterling Silver Link Chain Bracelet Unisex Jewellery", category: "Jewellery", salePriceMinor: 749, costMinor: 288, supplier: "Yiwu Bright Accessories", refundRate: 0.11, weight: 12 },
  { sku: "DI-3388", title: "Rolling Fridge Egg Storage Box Ladder Holder Dispenser Rack", category: "Home & Garden", salePriceMinor: 699, costMinor: 264, supplier: "Ningbo Homeware Direct", refundRate: 0.05, weight: 11 },
  { sku: "DI-4501", title: "Polarised Sunglasses Men Women Square Cycling Sport UV400", category: "Fashion", salePriceMinor: 744, costMinor: 271, supplier: "Yiwu Bright Accessories", refundRate: 0.09, weight: 10 },
  { sku: "DI-5119", title: "Self Adhesive Silicone Water Retaining Strip Shower Dam Barrier", category: "Home & Garden", salePriceMinor: 593, costMinor: 205, supplier: "Ningbo Homeware Direct", refundRate: 0.03, weight: 13 },
  { sku: "DI-6027", title: "TR414 Tubeless Tyre Valve Stems Rubber Snap-In 10 Pack", category: "Automotive", salePriceMinor: 699, costMinor: 231, supplier: "Guangzhou Autoline Parts", refundRate: 0.02, weight: 8 },
  { sku: "DI-6631", title: "Car Door Edge Protector Sticker Anti Scratch Clear Film Guard", category: "Automotive", salePriceMinor: 549, costMinor: 187, supplier: "Guangzhou Autoline Parts", refundRate: 0.04, weight: 9 },
  { sku: "DI-7042", title: "Wireless Doorbell PIR Motion Sensor Intelligent Chime Alarm Kit", category: "Electronics", salePriceMinor: 2999, costMinor: 1340, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.08, weight: 5 },
  { sku: "DI-7788", title: "Portable Power Bank 20000mAh Fast Charge Dual USB-C", category: "Electronics", salePriceMinor: 2299, costMinor: 1105, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.12, weight: 6 },
  { sku: "DI-8123", title: "Stainless Steel Insulated Water Bottle 750ml Vacuum Flask", category: "Sports & Outdoors", salePriceMinor: 1299, costMinor: 498, supplier: "Ningbo Homeware Direct", refundRate: 0.03, weight: 10 },
  { sku: "DI-8455", title: "LED Desk Lamp Dimmable USB Rechargeable Touch Control", category: "Home & Garden", salePriceMinor: 1599, costMinor: 702, supplier: "Ningbo Homeware Direct", refundRate: 0.06, weight: 7 },
  { sku: "DI-9014", title: "Soft Bristle Hair Brush Detangling Comb For Wigs Extensions", category: "Health & Beauty", salePriceMinor: 569, costMinor: 178, supplier: "Yiwu Bright Accessories", refundRate: 0.05, weight: 11 },
  { sku: "DI-9302", title: "Nose Strips for Snoring Better Breathing 60 Pack", category: "Health & Beauty", salePriceMinor: 499, costMinor: 152, supplier: "Yiwu Bright Accessories", refundRate: 0.07, weight: 9 },
  { sku: "DI-9640", title: "12Pcs Kitchen Food Bag Sealing Clips Airtight Food Saver Clamp", category: "Home & Garden", salePriceMinor: 479, costMinor: 141, supplier: "Ningbo Homeware Direct", refundRate: 0.02, weight: 12 },
  { sku: "DI-9915", title: "Bluetooth Speaker Waterproof Portable Outdoor 20W", category: "Electronics", salePriceMinor: 2499, costMinor: 1288, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.14, weight: 5 },
  { sku: "DI-1188", title: "Men's Running Shoes Lightweight Breathable Mesh Trainers", category: "Fashion", salePriceMinor: 3450, costMinor: 1742, supplier: "Quanzhou Stride Footwear", refundRate: 0.18, weight: 6 },
  { sku: "DI-1276", title: "Wireless Bluetooth Headphones Over-Ear Noise Cancelling", category: "Electronics", salePriceMinor: 3899, costMinor: 2265, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.10, weight: 7 },
  { sku: "DI-1390", title: "Smart Watch Series 9 Fitness Tracker Heart Rate Monitor", category: "Electronics", salePriceMinor: 2450, costMinor: 1420, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.16, weight: 6 },
  { sku: "DI-1455", title: "Heavy Duty Camping Tent Peg Stakes Galvanised 20 Pack", category: "Sports & Outdoors", salePriceMinor: 712, costMinor: 248, supplier: "Ningbo Homeware Direct", refundRate: 0.02, weight: 8 },
  { sku: "DI-1512", title: "Travel Cable Organiser Bag Waterproof Electronics Pouch", category: "Computing", salePriceMinor: 399, costMinor: 128, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.03, weight: 10 },
  { sku: "DI-1633", title: "Adjustable Multifunctional Pipe Wrench Plumbing Spanner", category: "DIY & Tools", salePriceMinor: 1244, costMinor: 489, supplier: "Guangzhou Autoline Parts", refundRate: 0.04, weight: 7 },
  { sku: "DI-1701", title: "Children Outdoor Air Rocket Foot Pump Launcher Toy Set", category: "Toys & Games", salePriceMinor: 852, costMinor: 341, supplier: "Shantou Playworks Toys", refundRate: 0.09, weight: 8 },
  { sku: "DI-1844", title: "Kids Sand Play Set Trolley Bulldozer Beach Toys", category: "Toys & Games", salePriceMinor: 999, costMinor: 402, supplier: "Shantou Playworks Toys", refundRate: 0.07, weight: 7 },
  { sku: "DI-1902", title: "22mm Sport Silicone Watch Strap Quick Release Band", category: "Fashion", salePriceMinor: 449, costMinor: 132, supplier: "Yiwu Bright Accessories", refundRate: 0.05, weight: 11 },
  { sku: "DI-2033", title: "Mini Digital Voltmeter Panel Meter 0.28 Inch 0-100V 4 Pack", category: "DIY & Tools", salePriceMinor: 649, costMinor: 219, supplier: "Guangzhou Autoline Parts", refundRate: 0.03, weight: 6 },

  // ── Underperformers ──────────────────────────────────────────────────
  // Every real catalogue has some. Without them the listing verdicts would
  // have nothing to catch, and a demo where nothing is ever wrong teaches
  // the user nothing about what the product is for.

  // The supplier put its price up; the listing was never re-priced. Every
  // sale now loses money once eBay takes its cut.
  { sku: "DI-2141", title: "Bluetooth Earbuds Wireless Charging Case Touch Control", category: "Electronics", salePriceMinor: 1299, costMinor: 1180, supplier: "Shenzhen Kaiyue Trading", refundRate: 0.13, weight: 7 },

  // Priced to win the buy box, and it does — at almost no margin.
  { sku: "DI-2258", title: "Phone Ring Holder Stand 360 Rotating Finger Grip", category: "Electronics", salePriceMinor: 349, costMinor: 268, supplier: "Yiwu Bright Accessories", refundRate: 0.06, weight: 9 },

  // Bulky and cheap: the postage eats what is left.
  { sku: "DI-2377", title: "Foldable Storage Ottoman Bench Faux Leather Large", category: "Home & Garden", salePriceMinor: 2499, costMinor: 2010, supplier: "Ningbo Homeware Direct", refundRate: 0.09, weight: 4 },

  // Sells fine, comes back constantly — the sizing on the listing is wrong.
  { sku: "DI-2489", title: "Compression Socks Unisex Graduated Support 3 Pairs", category: "Health & Beauty", salePriceMinor: 999, costMinor: 402, supplier: "Quanzhou Stride Footwear", refundRate: 0.32, weight: 8 },

  // A genuine loss-maker, kept listed by mistake — exactly the thing this
  // product exists to surface.
  { sku: "DI-2510", title: "Car Phone Mount Windscreen Suction Cradle Universal", category: "Automotive", salePriceMinor: 799, costMinor: 795, supplier: "Guangzhou Autoline Parts", refundRate: 0.11, weight: 5 },

];

export const SUPPLIERS = [
  { name: "Shenzhen Kaiyue Trading", website: "kaiyue-trading.example", reliability: 0.94 },
  { name: "Yiwu Bright Accessories", website: "yiwubright.example", reliability: 0.88 },
  { name: "Ningbo Homeware Direct", website: "ningbo-homeware.example", reliability: 0.91 },
  { name: "Guangzhou Autoline Parts", website: "autoline-parts.example", reliability: 0.96 },
  { name: "Quanzhou Stride Footwear", website: "stride-footwear.example", reliability: 0.72 },
  { name: "Shantou Playworks Toys", website: "playworks-toys.example", reliability: 0.83 },
];

export const REFUND_REASONS = [
  "Doesn't fit / changed mind",
  "Item not as described",
  "Item defective / doesn't work",
  "Arrived late",
  "Wrong item sent",
  "Damaged in transit",
];

export const BUYER_HANDLES = [
  "mwma_60", "shic11", "mac_9660", "micha4x4", "rectoryglebe", "maskram0", "cons6188",
  "t.nixon93", "copperpots", "ukharr_aqeur", "bsa175", "daviwomac_64", "jeke_90",
  "jamiema65", "cougarman770", "janeice178", "bysou2014", "veronicas444", "colouredcobs",
  "j.smithson_92", "sarah.j_12", "mbrown_85", "emma_w_21", "davidlee_77", "oliviad_44",
  "dtaylor_98", "smartin_10", "clazzad95", "javarg9321", "barm6267", "crvho46", "fialka143",
  "antno152", "l.hargreaves", "petew_1971", "kbennett_09", "n.oyelaran", "grahamt55",
];
