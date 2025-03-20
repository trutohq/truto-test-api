import { faker } from '@faker-js/faker'

export interface TicketTemplate {
  subject: string
  initialMessage: (orderNumber?: string) => string
  priority: 'low' | 'normal' | 'high'
  conversationFlow: Array<{
    message: (orderNumber?: string, itemDetails?: string) => string
    isAgent: boolean
    delayHours: number
    isPrivate?: boolean
  }>
  resolution?: {
    message: (orderNumber?: string) => string
    status: 'open' | 'closed'
  }
}

// Helper function to generate random order numbers
const generateOrderNumber = () =>
  `#${faker.number.int({ min: 10000, max: 99999 })}`

// Helper function to generate random SKUs
const generateSKU = () => `SKU-${faker.number.int({ min: 100, max: 999 })}`

// Helper function to generate random product names
const generateProduct = () => {
  const color = faker.color.human()
  const type = faker.helpers.arrayElement([
    'T-shirt',
    'Sweater',
    'Dress',
    'Jeans',
    'Jacket',
    'Handbag',
    'Shoes',
    'Watch',
    'Scarf',
    'Backpack',
  ])
  return `${color} ${type}`
}

export const ticketTemplates: TicketTemplate[] = [
  {
    subject: 'Order delayed - Need update on shipping status',
    initialMessage: (orderNumber = generateOrderNumber()) =>
      `Hi, I placed order ${orderNumber} ${faker.helpers.arrayElement([
        'three days ago',
        'last week',
        'a few days ago',
      ])} with express shipping, but I haven't received any shipping updates. Could you please check the status?`,
    priority: 'normal',
    conversationFlow: [
      {
        isAgent: true,
        message: (orderNumber) =>
          `${faker.helpers.arrayElement([
            'Hello!',
            'Hi there!',
            'Good day!',
          ])} I apologize for the delay. I'll check your order status right away. Could you please confirm your order number is ${orderNumber}?`,
        delayHours: 1,
      },
      {
        isAgent: false,
        message: () =>
          `Yes, that's correct. ${faker.helpers.arrayElement([
            "I really need this order soon as it's a gift.",
            'I was hoping to receive it by now.',
            'I paid for express shipping specifically to get it quickly.',
          ])}`,
        delayHours: 0.5,
      },
      {
        isAgent: true,
        message: () =>
          `I've checked with our shipping department. There was a slight delay due to ${faker.helpers.arrayElement(
            [
              'high volume',
              'weather conditions',
              'a temporary warehouse issue',
            ],
          )}, but your order has been dispatched today. You should receive the tracking number within the next few hours. I've also upgraded your shipping to priority at no extra cost for the inconvenience.`,
        delayHours: 2,
      },
      {
        isAgent: true,
        message: () =>
          `Internal Note: Upgraded shipping to priority due to delay. ${faker.helpers.arrayElement(
            [
              'Please monitor for delivery confirmation.',
              'Added customer to VIP list for next purchase.',
              'Flagged for shipping process review.',
            ],
          )}`,
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: false,
        message: () =>
          `${faker.helpers.arrayElement([
            'Thank you so much for checking and for the shipping upgrade!',
            'I really appreciate your help and the upgrade!',
            "That's great news, thank you for the shipping upgrade!",
          ])} I really appreciate it.`,
        delayHours: 1,
      },
    ],
    resolution: {
      message: () =>
        "You're welcome! Your order is now on its way. Is there anything else you need help with?",
      status: 'closed',
    },
  },
  {
    subject: 'Wrong item received in my order',
    initialMessage: (orderNumber = generateOrderNumber()) => {
      const orderedSKU = generateSKU()
      const receivedSKU = generateSKU()
      const orderedProduct = generateProduct()
      const receivedProduct = generateProduct()
      return `I just received my order but the product I received is different from what I ordered. I ordered a ${orderedProduct} (${orderedSKU}) but received a ${receivedProduct} (${receivedSKU}) instead.`
    },
    priority: 'high',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          "I'm so sorry to hear about this mix-up! I'll help you resolve this right away. Would you like us to send you the correct item or would you prefer a refund?",
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () => {
          const sku = generateSKU()
          return `Internal Note: Checking inventory for ${sku}. This is the third wrong item issue this week - might need to review warehouse picking process.`
        },
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: false,
        message: () =>
          "I'd really prefer to get the correct item if it's still in stock.",
        delayHours: 2,
      },
      {
        isAgent: true,
        message: () =>
          "I've checked and we do have the correct item in stock. I'll arrange for a replacement to be sent out immediately. We'll also send you a return label for the incorrect item.",
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () => {
          const replacementOrder = generateOrderNumber()
          const ticketNumber = faker.number.int({ min: 100, max: 999 })
          return `Internal Note: Created replacement order ${replacementOrder}. Added to warehouse review ticket #${ticketNumber} regarding picking errors.`
        },
        delayHours: 0.1,
        isPrivate: true,
      },
    ],
    resolution: {
      message: () =>
        "I've processed the replacement order with priority shipping. You should receive the return label in your email shortly. Once again, I apologize for the inconvenience.",
      status: 'closed',
    },
  },
  {
    subject: 'Need help with return process',
    initialMessage: () =>
      'I need to return an item I purchased last week. How do I initiate the return process?',
    priority: 'normal',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          "I'll be happy to help you with the return process. Could you please provide your order number?",
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () => 'Thanks! My order number is #67890',
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () =>
          'Internal Note: Customer within 30-day return window. Item unused according to previous communication.',
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: true,
        message: () =>
          "I've found your order. You can initiate the return through your account dashboard or I can help you process it here. Would you like me to help you with that?",
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () => 'Yes, please help me process it here.',
        delayHours: 1,
      },
    ],
    resolution: {
      message: () =>
        "I've initiated the return for you. You'll receive a return shipping label via email within the next hour. Once we receive the item back, we'll process your refund within 2-3 business days.",
      status: 'closed',
    },
  },
  {
    subject: 'Website technical issue - Cannot complete checkout',
    initialMessage: () =>
      "I've been trying to place an order for the last 30 minutes but keep getting an error at checkout. The payment won't go through even though my card is valid.",
    priority: 'high',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          "I apologize for the trouble you're experiencing. Let me check our system status. Could you tell me what error message you're seeing?",
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () =>
          "It says 'Transaction cannot be processed at this time' after I enter my card details.",
        delayHours: 0.25,
      },
      {
        isAgent: true,
        message: () =>
          'Internal Note: Multiple payment failures reported. Escalated to DevOps team - Incident #789. Payment processor reporting degraded performance.',
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: true,
        message: () =>
          "Thank you for that information. I've checked with our technical team and there appears to be a temporary issue with our payment processor. They're working on fixing it now.",
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () =>
          'Internal Note: DevOps confirmed issue resolved at 15:45 UTC. Monitor for any further failures.',
        delayHours: 0.1,
        isPrivate: true,
      },
    ],
    resolution: {
      message: () =>
        'The payment system is now back online. Could you please try placing your order again? If you continue to experience issues, please let me know.',
      status: 'closed',
    },
  },
  {
    subject: 'Question about product availability',
    initialMessage: () => {
      const product = generateProduct()
      const sku = generateSKU()
      return `When will the ${product} (${sku}) be back in stock? I've been waiting for weeks.`
    },
    priority: 'low',
    conversationFlow: [
      {
        isAgent: true,
        message: () => {
          const product = generateProduct()
          return `I'll check our inventory system for the expected restock date of the ${product}.`
        },
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () => {
          const sku = generateSKU()
          return `Internal Note: ${sku} - Next shipment scheduled for next week. High demand item, consider increasing order quantity.`
        },
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: true,
        message: () =>
          "I've checked and we expect to receive new stock within the next week. Would you like me to notify you when it's available?",
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () => 'Yes, please! I really want to purchase this item.',
        delayHours: 2,
      },
      {
        isAgent: true,
        message: () => {
          const sku = generateSKU()
          return `Internal Note: Added customer to notification list for ${sku}. 50+ customers waiting for this item. Flagged for inventory review.`
        },
        delayHours: 0.1,
        isPrivate: true,
      },
    ],
    resolution: {
      message: () =>
        "I've added you to the notification list. You'll receive an email as soon as the item is back in stock. Is there anything else you need help with?",
      status: 'open',
    },
  },
  {
    subject: 'Size exchange request',
    initialMessage: (orderNumber = generateOrderNumber()) => {
      const product = generateProduct()
      const sku = generateSKU()
      return `Hello, I received my ${product} (${sku}) from order ${orderNumber}, but it's ${faker.helpers.arrayElement(['too big', 'too small'])}. Can I exchange it for a different size?`
    },
    priority: 'normal',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          `Of course! I'd be happy to help you with the size exchange. ${faker.helpers.arrayElement(
            [
              'Could you tell me which size you would like instead?',
              'What size would you prefer?',
              'Which size would work better for you?',
            ],
          )}`,
        delayHours: 0.5,
      },
      {
        isAgent: true,
        message: (orderNumber) => {
          const sku = generateSKU()
          return `Internal Note: Order ${orderNumber} - ${sku} - ${faker.helpers.arrayElement(
            [
              'Customer reported sizing issue - adding to size guide review.',
              'Size exchange request - product might need size chart update.',
              'Consider adding more detailed measurements to product description.',
            ],
          )}`
        },
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: false,
        message: () =>
          `I'd like to exchange it for a ${faker.helpers.arrayElement(['smaller', 'larger'])} size. ${faker.helpers.arrayElement(
            [
              'The current one is just not fitting right.',
              'This size is not working for me at all.',
              'I checked the size chart but it seems off.',
            ],
          )}`,
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () =>
          `I'll help you process the exchange right away. ${faker.helpers.arrayElement(
            [
              'I will send you a return label for the current item.',
              'Let me generate a return shipping label for you.',
              'I will email you a prepaid return label shortly.',
            ],
          )}`,
        delayHours: 0.5,
      },
    ],
    resolution: {
      message: () =>
        "I've processed your exchange request. You'll receive the return label shortly, and once we receive the item, we'll ship out the new size right away. Is there anything else you need assistance with?",
      status: 'closed',
    },
  },
  {
    subject: 'Damaged item received',
    initialMessage: (orderNumber = generateOrderNumber()) => {
      const item = generateProduct()
      return `I just received my ${item} from order ${orderNumber}, but it's damaged. ${faker.helpers.arrayElement(
        [
          'The packaging was torn and the item is scratched.',
          'There are visible defects on the product.',
          'It appears to have been damaged during shipping.',
        ],
      )}`
    },
    priority: 'high',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          `I'm so sorry to hear about the damaged item! ${faker.helpers.arrayElement(
            [
              'Could you please provide some photos of the damage?',
              'Would you be able to send pictures of the damage?',
              'Can you share images showing the condition of the item?',
            ],
          )}`,
        delayHours: 0.5,
      },
      {
        isAgent: true,
        message: () =>
          `Internal Note: ${faker.helpers.arrayElement([
            'Possible shipping carrier issue - document for claim.',
            'Third damage report this week - review packaging standards.',
            'Added to quality control review list.',
          ])}`,
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: false,
        message: () =>
          `Yes, I've just sent the photos. ${faker.helpers.arrayElement([
            'As you can see, the item is unusable in this condition.',
            'The damage is quite significant.',
            'Unfortunately, it is not in a condition that I can use.',
          ])}`,
        delayHours: 1,
      },
      {
        isAgent: true,
        message: () =>
          `Thank you for the photos. ${faker.helpers.arrayElement([
            'I will process a replacement order right away.',
            'I will arrange for a new item to be sent immediately.',
            'We will ship out a replacement as soon as possible.',
          ])} No need to return the damaged item.`,
        delayHours: 0.5,
      },
    ],
    resolution: {
      message: () =>
        "I've processed your replacement order with expedited shipping. You should receive the new item within 2-3 business days. I sincerely apologize again for the inconvenience.",
      status: 'closed',
    },
  },
  {
    subject: 'Promo code not working',
    initialMessage: () =>
      `Hi, I'm trying to use the promo code ${faker.helpers.arrayElement([
        'SUMMER25',
        'SAVE20NOW',
        'SPECIAL30',
      ])} but it's not applying to my cart. ${faker.helpers.arrayElement([
        'The error says the code is invalid.',
        'It keeps saying the code has expired.',
        'The discount is not showing up.',
      ])}`,
    priority: 'normal',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          `I'll help you with the promo code issue. ${faker.helpers.arrayElement(
            [
              'Could you please confirm what items are in your cart?',
              'What items are you trying to purchase?',
              'Can you tell me what you are trying to buy?',
            ],
          )}`,
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () => {
          const items = Array(faker.number.int({ min: 1, max: 3 }))
            .fill(null)
            .map(() => generateProduct())
            .join(', ')
          return `I'm trying to buy ${items}.`
        },
        delayHours: 0.5,
      },
      {
        isAgent: true,
        message: () =>
          `Internal Note: ${faker.helpers.arrayElement([
            'Promo code validation issue - escalated to dev team.',
            'Multiple reports of promo code failures - investigating.',
            'Added to promotional campaign monitoring.',
          ])}`,
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: true,
        message: () =>
          `I understand the issue now. ${faker.helpers.arrayElement([
            'I will apply the discount manually to your order.',
            'Let me generate a special one-time code for you.',
            'I will help you place the order with the correct discount.',
          ])}`,
        delayHours: 1,
      },
    ],
    resolution: {
      message: () =>
        "I've created a special one-time use code for you: SPECIAL-VIP-DISCOUNT. This will give you the same discount, and it's valid for the next 24 hours.",
      status: 'closed',
    },
  },
  {
    subject: 'Account login issues',
    initialMessage: () =>
      `I can't log into my account. ${faker.helpers.arrayElement([
        'The password reset email never arrived.',
        'It says my account is locked.',
        'The verification code is not working.',
      ])}`,
    priority: 'high',
    conversationFlow: [
      {
        isAgent: true,
        message: () =>
          `I apologize for the login troubles. ${faker.helpers.arrayElement([
            'Could you please provide the email address associated with your account?',
            'What email address are you trying to use?',
            'Which email address is linked to your account?',
          ])}`,
        delayHours: 0.5,
      },
      {
        isAgent: false,
        message: () =>
          `My email is ${faker.internet.email()}. ${faker.helpers.arrayElement([
            'I have been trying to log in for the past hour.',
            'I need to access my account to check my orders.',
            'I have items in my cart that I need to purchase.',
          ])}`,
        delayHours: 0.5,
      },
      {
        isAgent: true,
        message: () =>
          `Internal Note: ${faker.helpers.arrayElement([
            'Possible authentication service degradation.',
            'Multiple login issues reported - monitoring auth system.',
            'Added to security review queue.',
          ])}`,
        delayHours: 0.1,
        isPrivate: true,
      },
      {
        isAgent: true,
        message: () =>
          `I've checked your account and ${faker.helpers.arrayElement([
            'I will help you regain access right away.',
            'I can see what is causing the issue.',
            'I will reset your account security settings.',
          ])}`,
        delayHours: 0.5,
      },
    ],
    resolution: {
      message: () =>
        "I've reset your account security and sent a new password reset link to your email. Please check your inbox and let me know if you need any further assistance.",
      status: 'closed',
    },
  },
]
