"use server";

import db from "./db";
import {
  imageSchema,
  profileSchema,
  propertySchema,
  validateWithZodSchema,
} from "./schemas";
import { uploadImage } from "./supabase";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { profile } from "console";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const getAuthUser = async () => {
  const user = await currentUser();
  if (!user) throw new Error("You must be logged in.");
  if (!user.privateMetadata.hasProfile) redirect("profile/create");
  return user;
};

const renderError = (err: unknown): { message: string } => {
  console.error(err);
  return {
    message: err instanceof Error ? err.message : "There was an error.",
  };
};

export const createProfileAction = async (
  prevState: any,
  formData: FormData
) => {
  try {
    const user = await currentUser();
    if (!user) throw new Error("You must be logged in.");

    const rawData = Object.fromEntries(formData);
    const validatedFields = validateWithZodSchema(profileSchema, rawData);
    await db.profile.create({
      data: {
        clerkId: user.id,
        email: user.emailAddresses[0].emailAddress,
        profileImage: user.imageUrl ?? "",
        ...validatedFields,
      },
    });
    await clerkClient.users.updateUserMetadata(user.id, {
      privateMetadata: {
        hasProfile: true,
      },
    });
    return { message: "Profile was created." };
  } catch (err) {
    return renderError(err);
  }
  redirect("/");
};

export const fetchProfileImage = async () => {
  const user = await currentUser();
  if (!user) return null;

  const profile = await db.profile.findUnique({
    where: {
      clerkId: user.id,
    },
    select: {
      profileImage: true,
    },
  });

  return profile?.profileImage;
};

export const fetchProfile = async () => {
  const user = await getAuthUser();
  const profile = await db.profile.findUnique({
    where: {
      clerkId: user.id,
    },
  });
  if (!profile) redirect("/profile/create");
  return profile;
};

export const updateProfileAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  const user = await getAuthUser();
  try {
    const rawData = Object.fromEntries(formData);
    const validatedFields = validateWithZodSchema(profileSchema, rawData);
    await db.profile.update({
      where: {
        clerkId: user.id,
      },
      data: validatedFields,
    });
    revalidatePath("/profile");
    return { message: "Profile updated successfully" };
  } catch (err) {
    return renderError(err);
  }

  return { message: "Update Profile Action" };
};

export const updateProfileImageAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  const user = await getAuthUser();
  try {
    const image = formData.get("image") as File;
    const validatedFields = validateWithZodSchema(imageSchema, { image });
    const fullPath = await uploadImage(validatedFields.image);

    await db.profile.update({
      where: {
        clerkId: user.id,
      },
      data: {
        profileImage: fullPath,
      },
    });
    revalidatePath("/profile");
    return { message: "Profile image updated successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const createPropertyAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  const user = await getAuthUser();
  try {
    const rawData = Object.fromEntries(formData);
    const file = formData.get("image") as File;
    console.log(rawData);

    const validatedFields = validateWithZodSchema(propertySchema, rawData);
    const validatedFile = validateWithZodSchema(imageSchema, { image: file });
    const fullPath = await uploadImage(validatedFile.image);

    await db.property.create({
      data: {
        ...validatedFields,
        image: fullPath,
        profileId: user.id,
      },
    });
  } catch (error) {
    return renderError(error);
  }
  redirect("/");
};

export const fetchProperties = async ({
  search = "",
  category,
}: {
  search?: string;
  category?: string;
}) => {
  const properties = await db.property.findMany({
    where: {
      category,
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { tagline: { contains: search, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      tagline: true,
      country: true,
      image: true,
      price: true,
    },
  });
  return properties;
};

export const fetchPropertyDetails = (id: string) => {
  return db.property.findUnique({
    where: {
      id,
    },
    include: {
      profile: true,
    },
  });
};
