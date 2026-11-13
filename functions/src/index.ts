import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { fetchPrices } from './fetchPrices';
export { fetchWeather } from './fetchWeather';
export { generateExplainer } from './generateExplainer';
export { scanAppliancePhoto } from './scanAppliancePhoto';
export { scanElectricityBill } from './scanElectricityBill';
export { fireDueApplianceNotifications } from './applianceNotifications';
export { sendDailyBriefings } from './dailyBriefing';
export { deleteMyAccount } from './deleteAccount';
export { dedupePushTokens } from './dedupePushTokens';
