export const PRIMARY_WEIXIN_PLATFORM = 'weixin' as const;
export const MOCK_WECHAT_PLATFORM = 'mock-wechat' as const;

export type WeixinPlatform = typeof PRIMARY_WEIXIN_PLATFORM;
export type ChannelPlatform = WeixinPlatform | typeof MOCK_WECHAT_PLATFORM;
