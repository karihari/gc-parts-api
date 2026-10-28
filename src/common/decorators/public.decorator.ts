import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a signed-in admin unless it is marked public.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
