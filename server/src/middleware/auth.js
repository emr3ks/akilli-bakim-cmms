import { forbidden, unauthorized } from '../errors.js';
import { findUserById } from '../repositories/users.js';

export async function authenticate(request, response, next) {
  try {
    const userId = request.get('x-user-id');
    if (!userId) throw unauthorized('x-user-id header is required');

    const user = await findUserById(request.db, userId);
    if (!user) throw unauthorized('The supplied x-user-id is not a known user');

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      next(forbidden(`This action requires one of these roles: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}
