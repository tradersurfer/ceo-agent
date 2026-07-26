/**
 * Schema.org JSON-LD generators for four high-leverage markup types:
 * reservations, order actions, discussion-forum postings, and profile
 * pages.
 *
 * Ported to JavaScript from the "seo-schema" skill's `scripts/schema_generate.py`
 * in AgriciDaniel/claude-seo (skills/seo-schema/SKILL.md declares
 * `license: MIT`, `metadata.author: AgriciDaniel`, `metadata.version: "2.2.4"`).
 * Source: https://github.com/AgriciDaniel/claude-seo/blob/main/scripts/schema_generate.py
 *
 * MIT License
 * Copyright (c) 2026 agricidaniel
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * This file is a derivative work: the four JSON-LD builder functions below
 * are reimplemented in JavaScript from the original Python (stdlib-only:
 * argparse/json/sys/typing — no network, no filesystem). The original CLI's
 * argparse layer is replaced with direct object input matching this
 * project's skill-handler contract; the generation logic itself (field
 * shapes, defaults, and the "strip nulls" cleanup pass) is otherwise
 * unchanged. This port covers only schema *generation* — the SKILL.md's
 * "Detection" section (scanning a live page for existing markup) requires
 * fetching a URL and is out of scope for this skill (network access,
 * excluded per this project's skill security boundary).
 */

function stripNones(payload) {
  if (Array.isArray(payload)) return payload.map(stripNones);
  if (payload && typeof payload === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== null && value !== undefined) result[key] = stripNones(value);
    }
    return result;
  }
  return payload;
}

const RESERVATION_KINDS = new Set([
  'FoodEstablishmentReservation', 'LodgingReservation', 'RentalCarReservation',
  'TaxiReservation', 'EventReservation', 'TrainReservation', 'FlightReservation',
]);

function buildReservation(input) {
  const kind = input.kind || 'FoodEstablishmentReservation';
  if (!RESERVATION_KINDS.has(kind)) {
    throw new Error(`Unsupported reservation kind: ${kind}`);
  }
  const payload = {
    '@context': 'https://schema.org',
    '@type': kind,
    reservationStatus: 'https://schema.org/ReservationConfirmed',
    provider: { '@type': 'Organization', name: input.provider },
    reservationFor: {
      '@type': kind === 'FoodEstablishmentReservation' ? 'FoodEstablishment' : 'Place',
      name: input.reservationForName || input.provider,
    },
    startTime: input.start,
    endTime: input.end,
    partySize: input.partySize != null ? Math.trunc(input.partySize) : undefined,
    reservationId: input.reservationId,
  };
  if (input.customerName || input.customerEmail) {
    payload.underName = {
      '@type': 'Person',
      name: input.customerName,
      email: input.customerEmail,
    };
  }
  return stripNones(payload);
}

function buildOrderAction(input) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'OrderAction',
    name: input.name || 'Order online',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: input.orderUrl,
      inLanguage: 'en-US',
      actionPlatform: [
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/MobileWebPlatform',
      ],
    },
    deliveryMethod: (input.deliveryMethod && input.deliveryMethod.length)
      ? input.deliveryMethod
      : ['https://schema.org/OnSitePickup', 'https://schema.org/ParcelService'],
    priceSpecification: {
      '@type': 'PriceSpecification',
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: 0,
        priceCurrency: 'USD',
      },
    },
    merchant: { '@type': 'Organization', name: input.merchant },
  };
  if (input.acceptedPaymentMethod && input.acceptedPaymentMethod.length) {
    payload.acceptedPaymentMethod = input.acceptedPaymentMethod.map(name => ({ '@type': 'PaymentMethod', name }));
  }
  return stripNones(payload);
}

function buildDiscussion(input) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: input.headline,
    author: { '@type': 'Person', name: input.author },
    datePublished: input.datePublished,
    url: input.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    text: input.text,
    dateModified: input.dateModified,
    commentCount: input.commentCount != null ? Math.trunc(input.commentCount) : undefined,
  };
  if (input.likes != null) {
    payload.interactionStatistic = [{
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/LikeAction',
      userInteractionCount: Math.trunc(input.likes),
    }];
  }
  return stripNones(payload);
}

function buildProfile(input) {
  const person = stripNones({
    '@type': 'Person',
    name: input.name,
    url: input.url,
    description: input.description,
    sameAs: (input.sameAs && input.sameAs.length) ? [...input.sameAs] : undefined,
    knowsAbout: (input.knowsAbout && input.knowsAbout.length) ? [...input.knowsAbout] : undefined,
    worksFor: input.worksFor ? { '@type': 'Organization', name: input.worksFor } : undefined,
    image: input.image,
    jobTitle: input.jobTitle,
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: person,
    url: input.url,
  };
}

const SCHEMA_MARKUP_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

/**
 * Registers the four schema-markup generation skills onto a SkillRegistry.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerSchemaMarkupSkills(registry) {
  registry.register('schema_reservation_markup', {
    capability: 'marketing_schema_markup',
    inputSchema: {
      provider: { type: 'string', required: true },
      start: { type: 'string', required: true },
      end: { type: 'string', required: false },
      partySize: { type: 'number', required: false },
      reservationId: { type: 'string', required: false },
      reservationForName: { type: 'string', required: false },
      customerName: { type: 'string', required: false },
      customerEmail: { type: 'string', required: false },
      kind: { type: 'string', required: false },
    },
    outputSchema: { jsonLd: { type: 'object', required: true } },
    permissions: SCHEMA_MARKUP_PERMISSION,
    handler: async input => ({ jsonLd: buildReservation(input) }),
  });

  registry.register('schema_order_markup', {
    capability: 'marketing_schema_markup',
    inputSchema: {
      merchant: { type: 'string', required: true },
      orderUrl: { type: 'string', required: true },
      name: { type: 'string', required: false },
      acceptedPaymentMethod: { type: 'array', required: false },
      deliveryMethod: { type: 'array', required: false },
    },
    outputSchema: { jsonLd: { type: 'object', required: true } },
    permissions: SCHEMA_MARKUP_PERMISSION,
    handler: async input => ({ jsonLd: buildOrderAction(input) }),
  });

  registry.register('schema_discussion_markup', {
    capability: 'marketing_schema_markup',
    inputSchema: {
      headline: { type: 'string', required: true },
      author: { type: 'string', required: true },
      url: { type: 'string', required: true },
      datePublished: { type: 'string', required: true },
      text: { type: 'string', required: false },
      dateModified: { type: 'string', required: false },
      commentCount: { type: 'number', required: false },
      likes: { type: 'number', required: false },
    },
    outputSchema: { jsonLd: { type: 'object', required: true } },
    permissions: SCHEMA_MARKUP_PERMISSION,
    handler: async input => ({ jsonLd: buildDiscussion(input) }),
  });

  registry.register('schema_profile_markup', {
    capability: 'marketing_schema_markup',
    inputSchema: {
      name: { type: 'string', required: true },
      url: { type: 'string', required: true },
      description: { type: 'string', required: false },
      sameAs: { type: 'array', required: false },
      knowsAbout: { type: 'array', required: false },
      worksFor: { type: 'string', required: false },
      image: { type: 'string', required: false },
      jobTitle: { type: 'string', required: false },
    },
    outputSchema: { jsonLd: { type: 'object', required: true } },
    permissions: SCHEMA_MARKUP_PERMISSION,
    handler: async input => ({ jsonLd: buildProfile(input) }),
  });

  return registry;
}

module.exports = {
  registerSchemaMarkupSkills,
  SCHEMA_MARKUP_PERMISSION,
  buildReservation,
  buildOrderAction,
  buildDiscussion,
  buildProfile,
};
