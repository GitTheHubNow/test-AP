import { prisma } from '@/lib/prisma';
import { verifyQrToken } from '@/lib/qr';
import { MemorialStatus, MemoryStatus } from '@prisma/client';

export interface QRMemorialData {
  memorial: {
    id: string;
    title: string;
    description: string | null;
  };
  memories: Array<{
    id: string;
    authorName: string | null;
    message: string;
    createdAt: Date;
  }>;
}

// Alias type used by app/memorial/[token]/page.tsx
export type PublicMemorialData = QRMemorialData;

interface MemorialSubmissionContext {
  id: string;
  status: MemorialStatus;
  readOnly: boolean;
}

export async function getMemorialByQRToken(
  token: string
): Promise<QRMemorialData | null> {
  // ✅ FIXED: Added await
  const memorial = await verifyQrToken(token);

  // ✅ verifyQrToken already returns the memorial, no need to query again!
  if (!memorial || memorial.status !== MemorialStatus.ACTIVE) {
    return null;
  }

  // Now get the memories
  const memories = await prisma.memory.findMany({
    where: {
      memorialId: memorial.id,
      status: MemoryStatus.APPROVED,
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
    take: 100,
  });

  return {
    memorial: {
      id: memorial.id,
      title: memorial.title,
      description: memorial.description,
    },
    memories,
  };
}

// Alias used by app/memorial/[token]/page.tsx
// Maps the same token → QR lookup → memorial + memories shape.
export const getPublicMemorialByToken = getMemorialByQRToken;

export async function getMemorialSubmissionContext(
  token: string
): Promise<MemorialSubmissionContext | null> {
  // ✅ FIXED: Added await
  const memorial = await verifyQrToken(token);

  // ✅ verifyQrToken already returns the memorial with all needed fields
  if (!memorial) {
    return null;
  }

  return {
    id: memorial.id,
    status: memorial.status,
    readOnly: memorial.readOnly,
  };
}

export function memorialAcceptsSubmissions(
  context: MemorialSubmissionContext
): boolean {
  if (context.status === MemorialStatus.SUSPENDED) {
    return false;
  }

  if (context.readOnly) {
    return false;
  }

  return true;
}
