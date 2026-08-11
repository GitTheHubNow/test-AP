import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { MemoryStatus } from '@prisma/client';

export interface ModerationMemory {
  id: string;
  authorName: string | null;
  message: string;
  createdAt: Date;
}

export interface ModerationMemorial {
  id: string;
  title: string;
  ownerId: string;
}

export interface AuthResult {
  authenticated: boolean;
  authorized: boolean;
  memorial?: ModerationMemorial;
}

export async function verifyMemorialOwnership(
  memorialId: string
): Promise<AuthResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      authenticated: false,
      authorized: false,
    };
  }

  const memorial = await prisma.memorial.findUnique({
    where: {
      id: memorialId,
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
    },
  });

  if (!memorial || memorial.ownerId !== userId) {
    return {
      authenticated: true,
      authorized: false,
    };
  }

  return {
    authenticated: true,
    authorized: true,
    memorial,
  };
}

export async function getPendingMemories(
  memorialId: string
): Promise<ModerationMemory[]> {
  const memories = await prisma.memory.findMany({
    where: {
      memorialId,
      status: MemoryStatus.PENDING,
    },
    select: {
      id: true,
      authorName: true,
      message: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 50,
  });

  return memories;
}