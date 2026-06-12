const jwt = require('jsonwebtoken');

const TICKET_SSO_TOKEN_EXPIRE = process.env.TICKET_SSO_TOKEN_EXPIRE || '30m';
const TICKET_SSO_DEFAULT_REDIRECT = process.env.TICKET_SSO_DEFAULT_REDIRECT || '/my-tickets';

function getTicketSsoSecret() {
  return process.env.HRMS_SSO_SECRET || process.env.JWT_SECRET;
}

function getTicketAppUrl() {
  return (process.env.TICKET_APP_URL || '').replace(/\/$/, '');
}

function buildHrmsToTicketSsoUrl(token, redirectPath) {
  const base = getTicketAppUrl();
  if (!base) {
    throw new Error('TICKET_APP_URL is not configured');
  }

  const redirect = redirectPath || TICKET_SSO_DEFAULT_REDIRECT;
  const params = new URLSearchParams({
    token,
    from: 'hrms',
    redirect,
  });

  return `${base}/auth-callback?${params.toString()}`;
}

function buildTicketSsoClaims(reqUser) {
  const hrmsId = reqUser.employeeRef
    ? String(reqUser.employeeRef)
    : String(reqUser._id);

  const username = reqUser.employeeId || reqUser.email;

  return {
    hrmsId,
    role: reqUser.role || 'employee',
    username,
    name: reqUser.name,
    email: reqUser.email,
  };
}

function createTicketSsoToken(reqUser) {
  const secret = getTicketSsoSecret();
  if (!secret) {
    throw new Error('JWT_SECRET or HRMS_SSO_SECRET is not configured');
  }

  return jwt.sign(buildTicketSsoClaims(reqUser), secret, {
    expiresIn: TICKET_SSO_TOKEN_EXPIRE,
  });
}

function buildTicketSsoUrlForUser(reqUser, redirectPath) {
  const token = createTicketSsoToken(reqUser);
  return buildHrmsToTicketSsoUrl(token, redirectPath);
}

module.exports = {
  buildTicketSsoUrlForUser,
  buildHrmsToTicketSsoUrl,
  createTicketSsoToken,
  buildTicketSsoClaims,
  getTicketAppUrl,
  TICKET_SSO_DEFAULT_REDIRECT,
};
