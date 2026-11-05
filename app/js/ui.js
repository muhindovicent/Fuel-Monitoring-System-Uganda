// Original inline line icons. No icon CDN, font download, or framework dependency.
const paths = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  pump: '<path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M2 21h14M4 10h10M7 6h4m3 5h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-4-4m2 2v4h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  chart: '<path d="M4 3v17h17M8 16v-4m5 4V8m5 8V5"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  report: '<path d="M5 3h10l4 4v14H5ZM14 3v5h5M9 12h6m-6 4h6"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.8-5A9 9 0 1 1 21 11Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 22h4"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
  building: '<path d="M4 21V6h11v15M15 11h5v10M2 21h20M8 10h3m-3 4h3m-3 4h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M9 10a2 2 0 1 1-4 0M9 10v10h4v-10zM12 10h2v10h-2z"/>',
  truck: '<path d="M3 17V5h11v12m0-8h4l3 4v4h-2M7 17h8"/><circle cx="5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  bike: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 6 9H5m3-13h4m1 4h5l1 9"/>',
  news: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="8 17 12 13 16 19"/><polyline points="16 17 12 13 16 9"/><line x1="8" y1="9" x2="16" y2="9"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  gallery: '<path d="M8 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><line x1="8" y1="21" x2="8" y2="3"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="16" y1="13" x2="16" y2="21"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  camera: '<path d="M14.5 4h-5c-1.65 0-2.97 1.3-3 3L2 12c0 1.09.39 2.13 1 2.93v6.13c0 .88.5 1.67 1.29 2.04l3.39 1.39c.43.17.91.22 1.44.22h9.06c.53 0 1-.19 1.44-.44l3.42-1.41A3 3 0 0 0 22 18.13v-6.13c0-1.09-.39-2.13-1-2.93l-7.5-3.71c-.02-1.7-1.35-3-3-3z"/><circle cx="10" cy="12" r="3"/>',
};

export const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;

export const services = [
  { title: 'Price trends & insights', description: 'Explore regional comparisons, published updates and source-backed market information.', href: '#analytics', icon: 'chart', tag: 'PRICE INTELLIGENCE' },
  { title: 'Find a fuel station', description: 'Explore stations by district or find the next stop near your location.', href: '#stations', icon: 'pin', tag: 'STATION DIRECTORY' },
  { title: 'Report a pump price', description: 'Share a price observation and follow its verification status.', href: '#report', icon: 'report', tag: 'CITIZEN CONTRIBUTIONS' },
  { title: 'Report a concern', description: 'Raise a station concern and securely attach supporting evidence.', href: '#complaints', icon: 'shield', tag: 'CONSUMER SERVICES' },
  { title: 'Track your case', description: 'Read case-officer replies and follow a documented resolution.', href: '#complaints', icon: 'search', tag: 'CASE FOLLOW-UP' },
  { title: 'Plan your fuel budget', description: 'Estimate trip fuel and cost using road distance and fresh prices.', href: '#trip', icon: 'route', tag: 'JOURNEY PLANNING' },
  { title: 'Driver community', description: 'Exchange useful road and fuel information in corridor rooms.', href: '#community', icon: 'chat', tag: 'ON THE ROAD' },
  { title: 'Advisories & town halls', description: 'Read source-linked releases and ask questions before a session.', href: '#advisories', icon: 'bell', tag: 'PUBLIC INFORMATION' },
  { title: 'Station operator services', description: 'Request station access or manage your approved station workspace.', href: '#operator', icon: 'building', tag: 'OPERATOR WORKSPACE' },
];
