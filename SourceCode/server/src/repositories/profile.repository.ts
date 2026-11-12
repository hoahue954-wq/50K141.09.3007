import { prisma } from '../config/prisma.js';

export const profileRepository = {
  findAuthProfileById(id: string) {
    return prisma.profile.findUnique({
      where: { id },
      include: { role: true },
    });
  },
};
