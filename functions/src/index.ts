import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { fetchPrices, ensureTodayPrices } from './fetchPrices';
export { fetchWeather } from './fetchWeather';
export { generateExplainer } from './generateExplainer';
export { scanAppliancePhoto } from './scanAppliancePhoto';
export { scanElectricityBill } from './scanElectricityBill';
export { fireDueApplianceNotifications } from './applianceNotifications';
export { sendDailyBriefings } from './dailyBriefing';
export { buildPriceOutlooks } from './priceOutlook';
export { checkDataHealth } from './dataHealth';
export { deleteMyAccount } from './deleteAccount';
export { refreshProStatus, revenueCatWebhook } from './proStatus';
export { dedupePushTokens } from './dedupePushTokens';
