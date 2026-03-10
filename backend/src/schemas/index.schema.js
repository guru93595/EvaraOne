const { z } = require("zod");

exports.createNodeSchema = z.object({
  body: z.object({
    id: z.string().optional(),
    displayName: z.string().min(1),
    assetType: z.string().min(1),
    assetSubType: z.string().optional(),
    zoneId: z.string().optional(),
    communityId: z.string().optional(),
    customerId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    channelId: z.string().optional(),
    readApiKey: z.string().optional(),
    capacity: z.number().optional(),
    status: z.string().optional()
  })
});

exports.updateNodeSchema = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    displayName: z.string().optional(),
    assetType: z.string().optional(),
    assetSubType: z.string().optional(),
    zoneId: z.string().optional(),
    communityId: z.string().optional(),
    customerId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    channelId: z.string().optional(),
    readApiKey: z.string().optional(),
    capacity: z.number().optional(),
    status: z.string().optional()
  })
});

exports.createZoneSchema = z.object({
    body: z.object({
        zoneName: z.string().min(1),
        state: z.string().min(1),
        country: z.string().min(1),
        zone_code: z.string().optional(),
        description: z.string().optional()
    })
});

exports.createCommunitySchema = z.object({
    body: z.object({
        name: z.string().min(1),
        zone_id: z.string().min(1),
        address: z.string().optional(),
        contact_email: z.string().optional(),
        contact_phone: z.string().optional()
    })
});

exports.createCustomerSchema = z.object({
    body: z.object({
        community_id: z.string().min(1),
        display_name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional()
    })
});
