import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry,MergeGeometry} from './PopEngine/CommonGeometry.js'
import {CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,Lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'
import GetBlitPixelTestRenderCommands from './BlitPixelsTest.js'
import ParseMagicaVox from './PopEngine/MagicaVox.js'

//	adreno (quest2) has a hardware optimised clear for 0,0,0 and 1,1,1
//	somehow this should be passed from XR api/camera (default clear?)
const ClearColour = [0,0,0,1];

const BEHAVIOUR_STATIC = 0;
const BEHAVIOUR_DEBRIS = 1;
const BEHAVIOUR_SHAPE = 2;

const CubeVelocityStretch = 2.0;
const FloorColour = [24, 64, 196,255].map(x=>(x/255));
//const FloorColour = [0.1,0.3,0.4,1.0];
const RenderFloor = true;
const FloorSize = 300;//800

const RenderDebugQuads = false;	//	need to avoid in xr
const DebugQuadTilesx = 10;
const DebugQuadTilesy = 10;

const RenderOctree = false;
const ReadBackOccupancyTexture = RenderOctree;
const GenerateOccupancyTexture = true;

const OccupancyTextureWidth = 128;
const OccupancyTextureHeight = 128;
const OccupancyMapSize = 
{
	WorldMin:[-7,-0.1,0],
	WorldMax:[4,2,-10],
};

async function CreateCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(-CubeSize,CubeSize);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


async function CreateUnitCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(0,1);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


function CreateBlitGeometry()
{
	let l = 0;
	let t = 0;
	let r = 1;
	let b = 1;
	const VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];
	
	const TexCoord = {};
	TexCoord.Size = 2;
	TexCoord.Data = VertexData;

	const Geometry = {};
	Geometry.TexCoord = TexCoord;
	return Geometry;
}

async function CreateBlitTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}

async function CreateDebugQuadTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}

const ZeroArrayCache = {};	//	[Length] = Float32Array(0's)
function GetZeroArray(Length)
{
	if ( !ZeroArrayCache[Length] )
	{
		ZeroArrayCache[Length] = new Float32Array(Length);
		ZeroArrayCache[Length].fill(0);
	}
	return ZeroArrayCache[Length];
}


let DebugQuadShader;
let BlitCopyShader;
let BlitUpdatePositions;
let BlitUpdateVelocitys;

function GetRenderCommandsUpdatePhysicsTextures(RenderContext,VoxelBuffer,Projectiles)
{
	const PositionTexture = VoxelBuffer.PositionsTexture;
	const PreviousPositionsTexture = VoxelBuffer.PreviousPositionsTexture;
	const VelocitysTexture = VoxelBuffer.VelocitysTexture;
	const PreviousVelocitysTexture = VoxelBuffer.PreviousVelocitysTexture;
	const ShapePositionsTexture = VoxelBuffer.ShapePositionsTexture;
	
	const Commands = [];
	
	const BlitGeo = AssetManager.GetAsset('BlitQuad',RenderContext);
	const State = {};
	State.BlendMode = 'Blit';
	
	let TexelSize = [1.0 / PositionTexture.GetWidth(),1.0 / PositionTexture.GetHeight()];
	
	//	copy old velocities to temp texture
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = VelocitysTexture;
		Commands.push(['SetRenderTarget',PreviousVelocitysTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}

	//	update velocitys texture
	{
		//	get projectile data
		//	todo: sort to significant projectiles within bounds
		function CompareProjectiles(a,b)
		{
			//	temp use nearest to 0,0,0 (use spawn time?)
			let Distancea = PopMath.Length3(a.Position);
			let Distanceb = PopMath.Length3(b.Position);
			if ( Distancea < Distanceb )	return -1;
			if ( Distancea > Distanceb )	return 1;
			return 0;
		}
		const UsefulProjectiles = Projectiles.slice().sort(CompareProjectiles);
		
		function GetProjectilePos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.Position,1];
		}
		function GetProjectilePrevPos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.PrevPosition,1];
		}
		const MAX_PROJECTILES = 100;
		let ProjectilePrevPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePrevPos );
		let ProjectileNextPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePos );
	
		const UpdateVelocitysShader = AssetManager.GetAsset(BlitUpdateVelocitys,RenderContext);
		const Uniforms = {};
		Uniforms.ShapePositionsTexture = ShapePositionsTexture;
		Uniforms.PreviousPositionsTexture = PreviousPositionsTexture;
		Uniforms.PreviousVelocitysTexture = PreviousVelocitysTexture;
		Uniforms.PositionsTexture = PositionTexture;
		Uniforms.ProjectilePrevPos = ProjectilePrevPos;
		Uniforms.ProjectileNextPos = ProjectileNextPos;
		Uniforms.TexelSize = TexelSize;
		Uniforms.CubeSize = CubeSize;
		Uniforms.Random4 = [Math.random(),Math.random(),Math.random(),Math.random()];
		
		Commands.push(['SetRenderTarget',VelocitysTexture]);
		Commands.push(['Draw',BlitGeo,UpdateVelocitysShader,Uniforms,State]);
	}

	//	copy old positions to temp texture
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = PositionTexture;
		Commands.push(['SetRenderTarget',PreviousPositionsTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}

	//	update positions texture
	{
		const UpdatePositionsShader = AssetManager.GetAsset(BlitUpdatePositions,RenderContext);
		const Uniforms = {};
		Uniforms.OldPositionsTexture = PreviousPositionsTexture;
		Uniforms.VelocitysTexture = VelocitysTexture;
		Uniforms.TexelSize = TexelSize;
		Commands.push(['SetRenderTarget',PositionTexture]);
		Commands.push(['Draw',BlitGeo,UpdatePositionsShader,Uniforms,State]);
	}
	
	return Commands;
}


function GetBoundingBoxesFromOccupancy(OccupancyTexture)
{
	if ( !OccupancyTexture )
		return [];
	
	let BoundingBoxes = [];

	const w = OccupancyTexture.GetWidth();
	const h = OccupancyTexture.GetHeight();
	const Channels = OccupancyTexture.GetChannels();
	if ( Channels != 4 )
		throw `Expecting 4 channels in occupancy texture, not ${Channels}`;
	const Pixels = OccupancyTexture.GetPixelBuffer();

	let MapWorldSize = [
		OccupancyMapSize.WorldMax[0] - OccupancyMapSize.WorldMin[0],
		OccupancyMapSize.WorldMax[1] - OccupancyMapSize.WorldMin[1],
		OccupancyMapSize.WorldMax[2] - OccupancyMapSize.WorldMin[2],
	];
	const YSectionsPerComponent = 5;
	const YSectionComponents = 4;
	const YSectionCount = (YSectionsPerComponent*YSectionComponents);

	let MapPixelStep = [1/w,1/YSectionCount,1/h];
	MapPixelStep[0] *= MapWorldSize[0];
	MapPixelStep[1] *= MapWorldSize[1];
	MapPixelStep[2] *= MapWorldSize[2];
	
	function GetBoundingBox(px,py,YBit)
	{
		let u = px / w;
		let v = py / h;
		let yf = YBit / YSectionCount;
		let x = Lerp( OccupancyMapSize.WorldMin[0], OccupancyMapSize.WorldMax[0], u ); 
		let y = Lerp( OccupancyMapSize.WorldMin[1], OccupancyMapSize.WorldMax[1], yf ); 
		let z = Lerp( OccupancyMapSize.WorldMin[2], OccupancyMapSize.WorldMax[2], v );
		const Box = {};
		Box.Min = [x,y,z];
		Box.Size = MapPixelStep;
		//Box.Size = MapPixelStep.slice();
		//Box.Size[1] = 0.10;
		return Box;
	}
	
	//	precalc this pow as it's expensive
	const SectionValues = new Array(YSectionsPerComponent).fill(0).map( (nul,cs) => Math.pow(10,cs) );
		
	function DecodeRgbaToBoundingBoxes(px,py,rgba)
	{
		const Boxs = [];
		
		for ( let SectionComponent=0;	SectionComponent<YSectionComponents;	SectionComponent++ )
		{
			for ( let CompSection=0;	CompSection<YSectionsPerComponent;	CompSection++ )
			{
				//	old bitfield
				//const Set = YBitfield & (1<<b);
				//	new section'd x10
				//	b=0 is 1+1+1+1 etc
				//	b=1 is 10+10+10
				const YBitfield = rgba[SectionComponent];
				//let SectionValue = Math.pow(10,CompSection);
				const SectionValue = SectionValues[CompSection];
				let HitsInSection = Math.floor( YBitfield / SectionValue ) % 10;
				const Set = (HitsInSection>0);
				const SectionIndex = (SectionComponent*YSectionsPerComponent) + CompSection;
				const b = SectionIndex;
				
				if ( !Set )
					continue;
				
				const Box = GetBoundingBox(px,py,b);
				Boxs.push(Box);
			}
		}
		return Boxs;
	}
		
	
	for ( let i=0;	i<Pixels.length;	i+=Channels)
	{
		//const Rgba = Pixels.slice( i, i+Channels );
		const r = Pixels[i+0];
		const g = Pixels[i+1];
		const b = Pixels[i+2];
		const a = Pixels[i+3];
		const Rgba = [r,g,b,a];
		const pi = i / Channels;
		const x = pi % w;
		const y = Math.floor( pi / w );
		const Boxs = DecodeRgbaToBoundingBoxes( x, y, Rgba );
		BoundingBoxes.push(...Boxs);
	}

	BoundingBoxes = BoundingBoxes.filter( b => b!=null );

	return BoundingBoxes;
}


class VoxelBuffer_t
{
	constructor()
	{
		//	base shape we're conforming to
		this.ShapePositionsTexture = null;
		this.Colours = null;
		
		//	live data
		this.PositionsTexture = null;
		this.PreviousPositionsTexture = null;
		this.VelocitysTexture = null;
		this.PreviousVelocitysTexture = null;
	}
	
	LoadPositions(Positions,Colours=null,CenterPosition=[0,0,0],InitialVelocityScale=0)
	{
		//	todo: append to existing positions,
		//		need to read latest texture (async op)
		
		function GetShapePositon4(xxx,Index)
		{
			if ( Index >= Positions.length )
				return [0,0,0,0];
			let xyz = Positions[Index].slice(0,3);
			xyz = Add3( xyz, CenterPosition );
			//	we'll use w as a random value per voxel
			let Random = Math.random();
			return [...xyz,Random];
		}

		function GetInitialVelocity4(xxx,Index)
		{
			let Scale = Math.random();
			//	make it less frequent for a high-speed fling
			Scale = Scale * Scale * Scale * Scale * Scale;
			
			Scale *= InitialVelocityScale;
			let x = Math.random()-0.5;
			let y = Math.random()-0.5;
			let z = Math.random()-0.5;
			let BehaviourType = BEHAVIOUR_SHAPE;
			return [x*Scale,y*Scale,z*Scale,BehaviourType];
		}
			
		let w = PopMath.GetNextPowerOf2(Math.floor( Math.sqrt(Positions.length) ));
		let h = w;//	this could reduce until w*h < cubecount
		let ShapePosition4s = new Array(w*h).fill(0).map(GetShapePositon4);
		ShapePosition4s = new Float32Array(ShapePosition4s.flat(2));
		this.ShapePositionsTexture = new Pop.Image();
		this.ShapePositionsTexture.WritePixels( w, h, ShapePosition4s, 'Float4' );
		
		//	make this auto generative
		this.PositionsTextureUvs = [];
		for ( let y=0;	y<h;	y++ )
		{
			for ( let x=0;	x<w;	x++ )
			{
				let uv = [x/w,y/h];
				this.PositionsTextureUvs.push(uv);
			}
		}
		this.PositionsTextureUvs = this.PositionsTextureUvs.slice(0,Positions.length);
		this.PositionsTextureUvs = this.PositionsTextureUvs.flat(2);
		this.PositionsTextureUvs = new Float32Array(this.PositionsTextureUvs);
		
		let InitialPosition4s = ShapePosition4s.slice();
		const StartAtZero = true;
		if ( StartAtZero )
		{
			function GetInitialPositon4(xxx,Index)
			{
				//	not well distributed, but doesnt matter, just favour away from 0 for radius
				const Angle = Math.random() * PopMath.DegToRad(360);
				let Radius = Math.random();
				Radius = 1.0 - (Radius*Radius);
				Radius *= 1;
				const x = Math.cos(Angle) * Radius;
				const y = 0;
				const z = Math.sin(Angle) * Radius;
				//let xyz = [Math.random()+0,0,Math.random()-5];
				let xyz = [x-0.8,y,z-5];
				xyz = Add3( xyz, CenterPosition );
				return [xyz,1];
			}
			InitialPosition4s = new Array(w*h).fill(0).map(GetInitialPositon4);
			InitialPosition4s = new Float32Array(InitialPosition4s.flat(2));
		}
		
		//	instead of a pool, we're setting up for double buffering
		this.PreviousPositionsTexture = new Pop.Image();
		this.PreviousPositionsTexture.WritePixels( w, h, InitialPosition4s, 'Float4' );
		this.PositionsTexture = new Pop.Image();
		this.PositionsTexture.WritePixels( w, h, InitialPosition4s, 'Float4' );
			
		let Velocity4s = new Array(w*h).fill(0).map(GetInitialVelocity4);
		Velocity4s = new Float32Array(Velocity4s.flat(2));
		this.VelocitysTexture = new Pop.Image();
		this.VelocitysTexture.WritePixels( w, h, Velocity4s, 'Float4' );
		this.PreviousVelocitysTexture = new Pop.Image();
		this.PreviousVelocitysTexture.WritePixels( w, h, Velocity4s, 'Float4' );
		
		//	instancing buffer
		if ( Colours.flat )
			Colours = Colours.flat(2);
		this.Colours = new Float32Array(Colours);
	}
}


const CubeCount = 64*64;
function GetCubePositionN(xyz,Index)
{
	xyz = [0,0,0];
	const Div = Math.floor(Math.cbrt(CubeCount));
	let x = (Index % Div);
	let y = Math.floor( (Index % (Div*Div)) / Div );
	let z = Math.floor( Index / (Div*Div) );

	let Spacing = 3.0;

	x -= Div/2;
	y -= Div/2;
	z -= Div/2;
	x *= CubeSize*Spacing;
	y *= CubeSize*Spacing;
	z *= CubeSize*Spacing;
	x += xyz[0];
	y += xyz[1];
	z += xyz[2];
	
	//	add a tiny offset to make it a bit more random
	const RandomSize = CubeSize * 1.0;
	x += (Math.random() - 0.5) * RandomSize;
	y += (Math.random() - 0.5) * RandomSize;
	z += (Math.random() - 0.5) * RandomSize;
	
	//return [(Index*0.06)-0.001,0.03,0];
	
	return [x,y,z];
}

function GetCubeLocalToWorldN(xyz,Index)
{
	xyz = GetCubePositionN(xyz,Index);
	return CreateTranslationMatrix(...xyz);
}

function GetColourN(xyz,Index)
{
	if ( Index == 0 )
		return [0,1,0,1];
	let rgb = GetRandomColour();
	const r = lerp( 0.4, 0.9, Math.random() );
	const b = lerp( 0.4, 0.9, Math.random() );
	const g = lerp( 0.4, 0.9, Math.random() );
	const a = 1;
	//return [r,g,b,a];
	return [...rgb,a];
}

let BoundingBoxShader = null;
let CubeShader = null;
let CubePhysicsShader = null;
let AppCamera = new Camera_t();
//	try and emulate default XR pose a bit
AppCamera.Position = [0,1.5,0];
AppCamera.LookAt = [0,1.5,-1];
AppCamera.FovVertical = 90;
let DefaultDepthTexture = CreateRandomImage(16,16);
let VoxelCenterPosition = [0,0,AppCamera.LookAt[2]];//AppCamera.LookAt.slice();
let CubeSize = 0.02;


const LocalToWorldTransforms = new Float32Array( new Array(CubeCount).fill(0).map( GetCubeLocalToWorldN ).flat(2) );
const RandomColours = new Array(CubeCount).fill(0).map( GetColourN ).flat(2);


class VoxelShape_t
{
	constructor()
	{
		this.Positions = [];
		this.AddPosition([0,0,0]);
		
		let Length = 0.2;
		for ( let z=0;	z<Length;	z+=CubeSize*2 )
			this.AddPosition([0,0,-z]);
		this.Length = Length;
	}
	
	AddPosition(xyz)
	{
		this.Positions.push(xyz);
	}
}


class Weapon_t
{
	Tick(TimestepSecs,PositionInsideBounds)
	{
	}
	
	//	world space forward
	get Forward()
	{
		return this.GetWorldForward();
	}
	
	GetWorldForward(Length=1,LocalToWorld=null)
	{
		//	should use GetFirePosition()?
		if ( !LocalToWorld )
			LocalToWorld = this.GetLocalToWorldTransform();
			
		let LocalForward = this.LocalForward;
		let LocalOrigin = [0,0,0];
		LocalForward = PopMath.TransformPosition( LocalForward, LocalToWorld  );
		LocalOrigin = PopMath.TransformPosition( LocalOrigin, LocalToWorld  );
		let WorldForward = Subtract3( LocalForward, LocalOrigin );
		WorldForward = PopMath.Normalise3( WorldForward, Length );
		return WorldForward;
	}
	
	SetOriginLocalToWorld(LocalToWorld)
	{
		//	this is the wrist on hands
		this.OriginLocalToWorld = LocalToWorld;
	}
}

class WeaponWreckingProjection_t extends Weapon_t
{
	constructor(LocalOriginOffset=[0,0,0])
	{
		super();
		this.LocalForward = [0,0,-1];
		this.Shape = new VoxelShape_t();
		this.LocalToWorldTransforms = null;	//	if set, we use explicit positions instead of shape

		this.Position = [0,0,0];
		this.Rotation = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		this.LocalOriginOffset = LocalOriginOffset;
		
		//	display this hand at this distance
		this.ProjectedDistance = 15.0;
		this.ProjectedScale = 15.0;
		
		//	we save the previous ones to reduce alloc, but also to 
		//	calculate velocity (prev pos -> pos);
		this.ProjectileCaches = [];	
		
		this.OriginLocalToWorld = PopMath.CreateIdentityMatrix();
	}
	
	Fire()
	{
	}
	
	ReleaseFire()
	{
	}
	
	SetPosition(Position,Rotation)
	{
		this.Position = Position.slice();
		if ( Rotation )
			this.Rotation = Rotation.slice();
	}
	
	SetRenderLocalToWorldTransforms(Transforms)
	{
		this.Position = Transforms[0];
		this.Rotation = null;
		
		//	if we ever need to do something a bit more complex, put
		//	these into local space & into the .Shape
		this.LocalToWorldTransforms = Transforms;
		
		//	this might want to move if the positions update faster than ticks
		this.UpdateProjectiles();
	}
	
	UpdateProjectiles()
	{
		const ProjectileVelocityStretch = 10;
		function PositionToProjectile(Transform,Index)
		{
			let IsNew = false;
			if ( !this.ProjectileCaches[Index] )
			{
				const NewProjectile = new Projectile_t();
				this.ProjectileCaches[Index] = NewProjectile;
				IsNew = true;
			}
			
			const Projectile = this.ProjectileCaches[Index];
			Projectile.PrevPosition = Projectile.Position.slice();
			Projectile.LocalToWorld = Transform;
			Projectile.Position = PopMath.GetMatrixTranslation(Projectile.LocalToWorldTransform);
			if ( IsNew )
				Projectile.PrevPosition = Projectile.Position.slice();
			
			Projectile.Velocity = PopMath.Subtract3( Projectile.Position, Projectile.PrevPosition );
			Projectile.Velocity = PopMath.Multiply3( Projectile.Velocity, [ProjectileVelocityStretch,ProjectileVelocityStretch,ProjectileVelocityStretch] );
			return Projectile;
		}
		
		//	generate live projectiles
		const ProjectedPositions = this.GetProjectedLocalToWorlds();
		const Projectiles = ProjectedPositions.map(PositionToProjectile.bind(this));
		//Projectiles.forEach( EnumProjectile );
	}
	
	GetLocalToWorldTransform(LocalOffset=[0,0,0])
	{
		LocalOffset = Add3( LocalOffset, this.LocalOriginOffset );
		
		let Transforms = [];
		let LocalTrans = PopMath.CreateTranslationMatrix( ...LocalOffset );
		Transforms.push(LocalTrans);
		
		//	position is pos+rot
		if ( this.Position.length == 4*4 )
		{
			Transforms.push(this.Position);
		}
		else
		{
			let WorldTrans = PopMath.CreateTranslationMatrix( ...this.Position );
			Transforms.push(this.Rotation);
			Transforms.push(WorldTrans);
		}
		
		let LocalToWorld = PopMath.MatrixMultiply4x4Multiple( ...Transforms );
		
		return LocalToWorld;
	}
	
	GetRenderLocalToWorldTransforms()
	{
		if ( this.LocalToWorldTransforms )
			return this.LocalToWorldTransforms;

		function TransformLocalPos(LocalPosition)
		{
			let LocalToWorld = this.GetLocalToWorldTransform(LocalPosition);
			return LocalToWorld;
		}
		let LocalPositions = this.Shape.Positions;
		let LocalTransforms = LocalPositions.map( TransformLocalPos.bind(this) );
		return LocalTransforms;
	}
	
	//	these form the "projectile" projection positons
	GetProjectedLocalToWorlds()
	{
		const WorldToInputOriginSpace = PopMath.MatrixInverse4x4( this.OriginLocalToWorld );
		
		//	make the extension scale with distance from face
		let Face = [0,1.5,0];
		let InputCenter = PopMath.GetMatrixTranslation(this.OriginLocalToWorld);
		let FaceDistance = PopMath.Distance3(Face,InputCenter);
		FaceDistance *= FaceDistance;
		
		let ProjectedDistance = FaceDistance * this.ProjectedDistance;
		let ProjectedScale = FaceDistance * this.ProjectedScale;
		//let ProjectedScale = 
		
		function ProjectLocalToWorld(LocalToWorld)
		{
			//	local space transform, so it should move & scale before being attached to its normal pos
			const ProjectLocalScale = PopMath.CreateScaleMatrix( ProjectedScale,ProjectedScale,ProjectedScale );
			/*
			
			//	extend in local space or the blocks will be squashed together
			//	if we project here, we're projecting in joint-space, so don't want to
			//const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,-this.ProjectedScale*0.4 );
			const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,0.4 );
			
			const ProjectWorldTrans = PopMath.CreateTranslationMatrix( ...WorldOffset );
			//const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( ProjectLocalScale, ProjectLocalTrans, LocalToWorld, ProjectWorldTrans );
			const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( LocalToWorld, WorldToInputOriginSpace, ProjectLocalScale, ProjectLocalTrans, LocalToWorld, ProjectWorldTrans );
			return NewLocalToWorld;
			*/
			const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,-ProjectedDistance );
			//	probbaly should be linked to scale and cube size?
			//	gr: this wont extend it just moves relative to wrist? though i think it should be rotated at that point...
			//const Extend = this.ProjectedScale * CubeSize * 10;
			//const ProjectLocalExtend = PopMath.CreateTranslationMatrix( 0,0,-Extend );
			const ProjectLocalExtend = PopMath.CreateTranslationMatrix( 0,0,0 );
			
			const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( LocalToWorld, WorldToInputOriginSpace, ProjectLocalExtend, ProjectLocalScale, ProjectLocalTrans, this.OriginLocalToWorld );
			return NewLocalToWorld;
		}
		
		const LocalToWorlds = this.GetRenderLocalToWorldTransforms();
		const ProjectedLocalToWorlds = LocalToWorlds.map(ProjectLocalToWorld.bind(this));
		return ProjectedLocalToWorlds;
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.ProjectileCaches.forEach(EnumProjectile);
	}
	
	Tick(TimestepSecs,PositionInsideBounds)
	{
		//	here we should be updating prevpos of projectile
	}
}

class WeaponGun_t extends Weapon_t
{
	constructor(LocalOriginOffset=[0,0,0])
	{
		super();

		this.LastFireTimeMs = null;		//	null button is up
		this.FireRepeatPerSec = 20;
		
		this.Projectiles = [];
		
		this.LocalForward = [0,0,-1];
		this.Shape = new VoxelShape_t();
		this.LocalToWorldTransforms = null;	//	if set, we use explicit positions instead of shape
		this.Position = [0,0,0];
		this.Rotation = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		this.LocalOriginOffset = LocalOriginOffset;
	}
	
	get FireRepeatAfterMs()
	{
		return Math.floor( 1000 / this.FireRepeatPerSec );
	}
	
	ReleaseFire()
	{
		this.LastFireTimeMs = null;
	}
	
	GetFirePosition()
	{
		//	gr: slightly random offset to stop strobing positions appearing in the same place
		let End = this.Shape.Length - (Math.random()*0.20);
		const Offset = [0,0,-End];
		const Transform = this.GetLocalToWorldTransform(Offset);
		const Pos = PopMath.TransformPosition([0,0,0],Transform);
		return Pos;
	}
	
	GetLocalToWorldTransform(LocalOffset=[0,0,0])
	{
		LocalOffset = Add3( LocalOffset, this.LocalOriginOffset );
		
		let Transforms = [];
		let LocalTrans = PopMath.CreateTranslationMatrix( ...LocalOffset );
		Transforms.push(LocalTrans);
		
		//	position is pos+rot
		if ( this.Position.length == 4*4 )
		{
			Transforms.push(this.Position);
		}
		else
		{
			let WorldTrans = PopMath.CreateTranslationMatrix( ...this.Position );
			Transforms.push(this.Rotation);
			Transforms.push(WorldTrans);
		}
		
		let LocalToWorld = PopMath.MatrixMultiply4x4Multiple( ...Transforms );
		
		return LocalToWorld;
	}


	SetPosition(Position,Rotation)
	{
		this.Position = Position.slice();
		if ( Rotation )
			this.Rotation = Rotation.slice();
	}
	
	SetRenderLocalToWorldTransforms(Transforms)
	{
		this.Position = Transforms[0];
		this.Rotation = null;
		
		//	if we ever need to do something a bit more complex, put
		//	these into local space & into the .Shape
		this.LocalToWorldTransforms = Transforms;
	}
	
	GetRenderLocalToWorldTransforms()
	{
		if ( this.LocalToWorldTransforms )
			return this.LocalToWorldTransforms;

		function TransformLocalPos(LocalPosition)
		{
			let LocalToWorld = this.GetLocalToWorldTransform(LocalPosition);
			return LocalToWorld;
		}
		let LocalPositions = this.Shape.Positions;
		let LocalTransforms = LocalPositions.map( TransformLocalPos.bind(this) );
		return LocalTransforms;
	}
	
	CreateProjectile()
	{
		const ForceMetresPerSec = 20;
		const Position = this.GetFirePosition();
		const Forward = this.Forward;
		
		const Velocity = Multiply3( Forward, [ForceMetresPerSec,ForceMetresPerSec,ForceMetresPerSec] );
		this.Projectiles.push( new Projectile_t(Position, Velocity) );
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.Projectiles.forEach(EnumProjectile);
	}
	
	Fire()
	{
		this.CreateProjectile();
		this.LastFireTimeMs = Pop.GetTimeNowMs();
	}
	
	Tick(TimestepSecs,PositionInsideBounds)
	{
		this.RepeatFire();

		this.Projectiles.forEach( p => p.Move(TimestepSecs) );

		//	cull projectiles
		function ProjectileInsideBounds(Projectile)
		{
			return PositionInsideBounds(Projectile.Position);
		}
		this.Projectiles = this.Projectiles.filter(ProjectileInsideBounds.bind(this));
	}
	
	RepeatFire()
	{	
		//	repeat fire 
		if ( this.LastFireTimeMs === null )
			return;
		const Elapsed = Pop.GetTimeNowMs() - this.LastFireTimeMs;
		if ( Elapsed > this.FireRepeatAfterMs )
			this.Fire();
	}
}


function RenderBoundingBoxes(PushCommand,RenderContext,CameraUniforms,BoundingBoxes)
{
	if ( !BoundingBoxes.length )
		return;
		
	const Geo = AssetManager.GetAsset('UnitCube',RenderContext);
	const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);

	function BoundingBoxToLocalToWorld(BoundingBox)
	{
		//	get a scale and origin for cube 0..1
		let Translation = BoundingBox.Min;
		let Scale = BoundingBox.Size;
		const LocalToWorld = PopMath.CreateTranslationScaleMatrix(Translation,Scale);
		return LocalToWorld;
	}

	//	straight into a flat array is so much faster
	//const LocalToWorlds = BoundingBoxes.map( BoundingBoxToLocalToWorld );
	let BoundingBoxLocalToWorlds = [];
	BoundingBoxes.forEach( bb => BoundingBoxLocalToWorlds.push( ...BoundingBoxToLocalToWorld(bb) ) );

	//	to avoid allocating new zero arrays often as this number of bounding boxes changes so wildly
	//	do it in chunks so (ideally) it's 1 or 2 draw calls, one with only a small remainder
	const DrawCallSize = 100*1000;
	for ( let DrawCall=0;	DrawCall<Math.ceil(BoundingBoxLocalToWorlds.length/DrawCallSize);	DrawCall++ )
	{
		let LocalToWorlds = BoundingBoxLocalToWorlds.slice( DrawCall*DrawCallSize, (DrawCall+1)*DrawCallSize );
		if ( LocalToWorlds.length < DrawCallSize )
			LocalToWorlds.length = DrawCallSize;

		const Uniforms = Object.assign({},CameraUniforms);
		Uniforms.LocalToWorldTransform = LocalToWorlds;
		Uniforms.WorldVelocity = GetZeroArray(3*LocalToWorlds.length);
		Uniforms.Colour = GetZeroArray(4*LocalToWorlds.length);
		Uniforms.VelocityStretch = 0.0;
		
		const State = {};
		State.BlendMode = 'Blit';
		State.DepthWrite = true;
		State.DepthRead = true;
			
		const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
		PushCommand( DrawCube );
	}
}

function RenderCubes(PushCommand,RenderContext,CameraUniforms,CubeTransforms,CubeVelocitys,OccupancyTexture,Colours=RandomColours)
{
	if ( !CubeTransforms.length )
		return;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset(CubeShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.WorldVelocity = CubeVelocitys;
	Uniforms.Colour = Colours.slice( 0, CubeTransforms.length*4 );
	Uniforms.VelocityStretch = CubeVelocityStretch;
	
	Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
	Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
	Uniforms.OccupancyMapTexture = OccupancyTexture;
	Uniforms.OccupancyMapTextureSize = [OccupancyTexture.GetWidth(),OccupancyTexture.GetHeight()];

	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderVoxelBufferCubes(PushCommand,RenderContext,CameraUniforms,VoxelsBuffer,OccupancyTexture)
{
	if ( !VoxelsBuffer )
		return;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset(CubePhysicsShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	//Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.Colour = VoxelsBuffer.Colours;
	Uniforms.VelocityStretch = CubeVelocityStretch;

	let PositionsTexture = VoxelsBuffer.PositionsTexture;
	let VelocitysTexture = VoxelsBuffer.VelocitysTexture;
	//	temp texture happens to have the previous positions
	let PreviousPositionsTexture = VoxelsBuffer.PreviousPositionsTexture;

	Uniforms.PhysicsPreviousPositionsTexture = PreviousPositionsTexture;
	Uniforms.PhysicsPositionsTexture = PositionsTexture;
	Uniforms.PhysicsPositionsTextureSize = [PositionsTexture.GetWidth(),PositionsTexture.GetHeight()];
	Uniforms.PhysicsPositionUv = VoxelsBuffer.PositionsTextureUvs;
	Uniforms.PhysicsVelocitysTexture = VelocitysTexture;
	
	Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
	Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
	Uniforms.OccupancyMapTexture = OccupancyTexture;
	Uniforms.OccupancyMapTextureSize = [OccupancyTexture.GetWidth(),OccupancyTexture.GetHeight()];
	
	
	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderDebugQuad( PushCommand, RenderContext, DebugTexture, Index, DrawTransparent )
{
	const Geo = AssetManager.GetAsset('DebugQuad',RenderContext);
	const Shader = AssetManager.GetAsset(DebugQuadShader,RenderContext);

	const Width = 1/DebugQuadTilesx;
	const Height = 1/DebugQuadTilesy;
	let Left = Index % DebugQuadTilesx;
	let Top = Math.floor(Index/DebugQuadTilesx);
	
	const Uniforms = {};
	Uniforms.Rect = [Left,Top,Width,Height];
	Uniforms.Texture = DebugTexture;

	const State = {};
	State.BlendMode = DrawTransparent ? 'Alpha' : 'Blit';
	
	PushCommand(['Draw',Geo,Shader,Uniforms,State]);
}


class Projectile_t
{
	constructor(Position=[0,0,0],InitialForce=[0,0,0],GravityMult=1,Drag=0.00001)
	{
		this.PrevPosition = Position.slice();
		this.Position = Position.slice();
		this.LocalToWorld = null;	//	alternative
		
		this.Velocity = [0,0,0];
		this.Drag = Drag;
		
		let GravityPerSec = -8 * GravityMult;
		this.GravityForce = [0,GravityPerSec,0];
		this.PendingForce = InitialForce;
	}
	
	get LocalToWorldTransform()
	{
		if ( this.LocalToWorld )
			return this.LocalToWorld;
			
		const LocalToWorld = PopMath.CreateTranslationMatrix( ...this.Position );
		return LocalToWorld;
	}
	
	Move(TimestepSecs)
	{
		const Timestep3 = [TimestepSecs,TimestepSecs,TimestepSecs];
		
		//	apply drag
		const Damp = 1.0 - this.Drag;
		const Damp3 = [Damp,Damp,Damp];
		this.Velocity = Multiply3( this.Velocity, Damp3);
		
		//	apply forces
		let Force = this.PendingForce.slice();
		this.PendingForce = [0,0,0];
		Force = Add3( Force, Multiply3( this.GravityForce, Timestep3 ) );
		
		this.Velocity = Add3( this.Velocity, Force );
	
		let Delta = Multiply3( this.Velocity, Timestep3 );
		
		this.PrevPosition = this.Position.slice();
		this.Position = Add3( this.Position, Delta );
	}
}

class Game_t
{
	constructor()
	{
		this.Weapons = {};	//	named weapons for different inputs
		this.Projectiles = [];
		this.WorldBoundsSphere = [0,0,0,50];
		//	projectiles are being culled before they get tested in physics
		this.WorldBoundsFloorY = -3;
	}
	
	GetWeapons()
	{
		return Object.values(this.Weapons);
	}
	
	GetWeapon(Name)
	{
		if ( !this.Weapons[Name] )
		{
			const Offset = (Name=='Desktop') ? [0,-0.15,0.3] : [0,0,0];
			console.log(`Creating weapon ${Name}`);
			const WeaponType = Name.startsWith('left') ? WeaponWreckingProjection_t : WeaponGun_t;
			this.Weapons[Name] = new WeaponType(Offset);
		}
		return this.Weapons[Name];
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.Projectiles.forEach( EnumProjectile );
		for ( let Weapon of Object.values(this.Weapons) )
		{
			Weapon.EnumProjectiles(EnumProjectile);
		}
	}
	
	CreateProjectile(Position,Forward,Force)
	{
		const Velocity = Multiply3( Forward, [Force,Force,Force] );
		this.Projectiles.push( new Projectile_t(Position, Velocity) );
	}
	
	OnFireWeapon(Weapon)
	{
		Weapon.Fire();
	}
		
	OnDesktopFireDown()
	{
		const Weapon = this.GetWeapon('Desktop');
		Weapon.Fire();
	}
	
	OnDesktopFireUp()
	{
		const Weapon = this.GetWeapon('Desktop');
		Weapon.ReleaseFire();
	}
	
	
	UpdateWeaponDesktop(Camera)
	{
		const Weapon = this.GetWeapon('Desktop');
		//	forward seems right on webxr camera/transform, but not our camera...
		Weapon.LocalForward = [0,0,1];
		let Rotation = Camera.GetLocalRotationMatrix();
		Rotation = PopMath.MatrixInverse4x4( Rotation );
		let Position = Camera.Position;
		//let Position = Subtract3( [0,0,0], Camera.Position );
		//Position = Add3( Position, [0,-0.3,0.0] );
		Weapon.SetPosition( Position, Rotation );
	}
	
	PositionInsideBounds(Position)
	{
		if ( Position[1] < this.WorldBoundsFloorY )
			return false;
		let Distance = PopMath.Distance3(Position,this.WorldBoundsSphere);
		return Distance <= this.WorldBoundsSphere[3]; 
	}
	
	Tick(TimestepSecs)
	{
		for ( let Projectile of this.Projectiles )
		{
			Projectile.Move(TimestepSecs);
		}

		function ProjectileInsideBounds(Projectile)
		{
			return this.PositionInsideBounds(Projectile.Position);
		}
		//	cull old projectiles
		this.Projectiles = this.Projectiles.filter(ProjectileInsideBounds.bind(this));

		//	repeat fire weapons
		const Weapons = this.GetWeapons();
		Weapons.forEach( w => w.Tick(TimestepSecs,this.PositionInsideBounds.bind(this)) );
	}
	
	GetDebugTextures()
	{
		let Textures = [
			this.OccupancyTexture
		];
		Textures = Textures.filter( t => t!=null );
		return Textures;
	}
	
	GetPhysicsRenderCommands(RenderContext,TimestepSecs)
	{
		const Projectiles = [];
		this.EnumProjectiles( p => Projectiles.push(p) );
		
		const Commands = [];
		for ( let VoxelBuffer of this.VoxelBuffers )
		{
			const SomeCommands = GetRenderCommandsUpdatePhysicsTextures( RenderContext, VoxelBuffer, Projectiles );
			Commands.push(...SomeCommands);
		}
		
		if ( !this.OccupancyTexture )
		{
			this.OccupancyTexture = new Pop.Image();
			const w = OccupancyTextureWidth;
			const h = OccupancyTextureHeight;
			let rgba = new Array(w*h).fill([0,0,0,0]);
			rgba = new Float32Array(rgba.flat(2));
			this.OccupancyTexture.WritePixels(w,h,rgba,'Float4');
		}
		
		if ( GenerateOccupancyTexture )
		{
			try
			{
				const TestCommands = GetBlitPixelTestRenderCommands(RenderContext,this.OccupancyTexture, this.VoxelBuffers[0], OccupancyMapSize, ReadBackOccupancyTexture );
				Commands.push(...TestCommands);
			}
			catch(e)
			{
				console.error(e);
			}
		}
		
		return Commands;
	}
	
	//	gr: this should really return commands?
	//		depends if we need to read it back...
	async GpuTick(RenderContext,TimestepSecs)
	{
		//	generate rendercommands then run them
		const Commands = this.GetPhysicsRenderCommands(RenderContext,TimestepSecs);
		//	also... dont need to wait if we're not reading stuff back
		//	this causes 2 waits for animations
		//await RenderContext.Render(Commands);
		RenderContext.Render(Commands);
	}
	
	async WaitForEnemniesDestroyed()
	{
		let x = 999;
		while ( x != 0 )
			await Pop.Yield(999*10000);
	}
	
	async LoadLevel()
	{
		//	generate voxel enemies
		this.VoxelBuffers = [];
		
		const LoadFile = `Models/Taxi.vox`;
		//const LoadFile = `Models/Skeleton.vox`;
		//const LoadFile = false;
		
		if ( !LoadFile )
		{
			let Positions = new Array(CubeCount).fill(0).map(GetCubePositionN);
			let Voxels = new VoxelBuffer_t();
			Voxels.LoadPositions( Positions, RandomColours, VoxelCenterPosition, 0.4 );
			this.VoxelBuffers.push(Voxels);
		}
		
		if ( LoadFile )
		{
			const VoxContents = await Pop.FileSystem.LoadFileAsArrayBufferAsync(LoadFile);
			
			const MergedGeometry = {};
			function OnGeometry(Geometry)
			{
				for ( let Attrib in Geometry )
				{
					let Data = MergedGeometry[Attrib] || [];
					Data = Data.concat( Geometry[Attrib] );
					MergedGeometry[Attrib] = Data;
				}
			}
			await ParseMagicaVox( VoxContents, OnGeometry );
			const Geometry = MergedGeometry;
			
			let Voxels = new VoxelBuffer_t();
			
			const SkipEveryX = 0;
			
			function TweakPosition(xyz,Index)
			{
				if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
					return null;
				let Scale = [CubeSize*2,CubeSize*2,CubeSize*2];
				
				xyz = Multiply3( xyz, Scale );
				xyz = Add3( xyz, VoxelCenterPosition );
				return xyz;
			}
			
			function TweakColour(rgba,Index)
			{
				if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
					return null;
				let ToneChange = (Math.random()-0.5)*0.05;
				rgba[0] += ToneChange;
				rgba[1] += ToneChange;
				rgba[2] += ToneChange;
				return rgba;
			}
			Geometry.Colours = Geometry.Colours.map(TweakColour).filter( x=>x != null );
			Geometry.Positions = Geometry.Positions.map(TweakPosition).filter( x=>x != null );
			
			Geometry.Colours = new Float32Array(Geometry.Colours.flat(2));
			
			Voxels.LoadPositions( Geometry.Positions, Geometry.Colours, VoxelCenterPosition, 0.0 );
			this.VoxelBuffers.push(Voxels);
		}
			
	}
	
	async RunGameIteration()
	{
		//	show hello
		//	load assets
		await this.LoadLevel();
		//	wait for all enemies shot
		await this.WaitForEnemniesDestroyed();
		//	show game over
	}
}


export default class App_t
{
	constructor()
	{
		this.RegisterAssets();
		this.Game = new Game_t();
	}
	
	get Camera()	{	return AppCamera;	}
	
	RegisterAssets()
	{
		if ( CubeShader )
			return;
		AssetManager.RegisterAssetAsyncFetchFunction('Cube', CreateCubeTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('UnitCube', CreateUnitCubeTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('BlitQuad', CreateBlitTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('DebugQuad', CreateDebugQuadTriangleBuffer );

		{
			const VertFilename = 'Geo.vert.glsl';
			const FragFilename = 'Colour.frag.glsl';
			CubeShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
			const VertPhysicsFilename = 'PhysicsGeo.vert.glsl';
			CubePhysicsShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertPhysicsFilename);
		}
		{
			const VertFilename = 'Geo.vert.glsl';
			const FragFilename = 'BoundingBox.frag.glsl';
			BoundingBoxShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
		}
		{
			const VertBlitQuadFilename = 'BlitQuad.vert.glsl';
			BlitCopyShader = AssetManager.RegisterShaderAssetFilename('BlitCopy.frag.glsl',VertBlitQuadFilename);
			BlitUpdatePositions = AssetManager.RegisterShaderAssetFilename('BlitUpdatePositions.frag.glsl',VertBlitQuadFilename);
			BlitUpdateVelocitys = AssetManager.RegisterShaderAssetFilename('BlitUpdateVelocitys.frag.glsl',VertBlitQuadFilename);
		}
		DebugQuadShader = AssetManager.RegisterShaderAssetFilename('DebugQuad.frag.glsl','DebugQuad.vert.glsl');
	}
	
	BindXrControls(Device)
	{
		const Game = this.Game;
		Device.OnMouseMove = function(xyz,Button,InputName,Transform,ExtraData)
		{
			//	false when not tracking
			if ( !Transform )
				return;

			const Weapon = Game.GetWeapon(InputName);
			let Rotation = Transform.matrix;
			PopMath.SetMatrixTranslation(Rotation,0,0,0,1);
		
			Weapon.SetPosition(xyz,Rotation);

			//	if hand, use all the points
			if ( ExtraData && ExtraData.LocalToWorlds )
			{
				Weapon.SetRenderLocalToWorldTransforms( ExtraData.LocalToWorlds );
			}
			if ( ExtraData && ExtraData.InputOriginLocalToWorld )
			{
				Weapon.SetOriginLocalToWorld(ExtraData.InputOriginLocalToWorld);
			}

			//	if this is a hand, it has extra positions;
			//	if the finger is outstretched, treat it as a button press
			//	dont fire from thumb
			const IsThumb = InputName.includes('thumb');
			if ( ExtraData && ExtraData.LocalToWorlds && !IsThumb )
			{
				const Weapon = Game.GetWeapon(InputName);
				const Positions = ExtraData.LocalToWorlds.map( PopMath.GetMatrixTranslation );
				const Straightness = PopMath.GetStraightnessOfPoints(Positions);
				if ( Straightness > 0.85 )
				{
					Game.OnFireWeapon(Weapon);
				}
				else
				{
					Weapon.ReleaseFire();
				}
			}

		}
		
		Device.OnMouseDown = function(xyz,Button,InputName,Transform)
		{
			//	update position as move isn't called when mouse is down
			Device.OnMouseMove( ...arguments );
			
			const Weapon = Game.GetWeapon(InputName);
			Game.OnFireWeapon(Weapon);
		}

		Device.OnMouseUp = function(xyz,Button,InputName,Transform)
		{
			const Weapon = Game.GetWeapon(InputName);
			Weapon.ReleaseFire();
		}
	}
	
	BindMouseCameraControls(RenderView)
	{
		const Camera = this.Camera;
		const Game = this.Game;
		
		RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
		{
			if ( Button == 'Left' )
			{
				if ( FirstDown )
					Game.OnDesktopFireDown();
			}
			
			if ( Button == 'Right' )
				Camera.OnCameraFirstPersonRotate( x, y, 0, FirstDown!=false );
			
			if ( Button == 'Middle' )
				Camera.OnCameraPanLocal( -x, y, 0, FirstDown!=false );
		}
		
		RenderView.OnMouseMove = function(x,y,Button)
		{
			RenderView.OnMouseDown( x, y, Button, false );
		}
		
		RenderView.OnMouseScroll = function(x,y,Button,Delta)
		{
			Camera.OnCameraPanLocal( x, y, 0, true );
			Camera.OnCameraPanLocal( x, y, -Delta[1] * 10.0, false );
			//Camera.OnCameraZoom( -Delta[1] * 0.1 );
		}
		
		RenderView.OnMouseUp = function(x,y,Button)
		{
			if ( Button == 'Left' )
				Game.OnDesktopFireUp();
		}
	}
	
	GetDesktopRenderCommands(RenderContext,RenderView)
	{
		//	update camera
		const Viewport = RenderView.GetScreenRect();
		
		return this.GetSceneRenderCommands( RenderContext, this.Camera, Viewport );
	}
	
	GetXrRenderCommands(RenderContext,Camera)
	{
		return this.GetSceneRenderCommands(...arguments);
	}
	
	GetSceneRenderCommands(RenderContext,Camera,Viewport=[0,0,1,1])
	{
		//	make screen camera track xr camera
		AppCamera.Position = Camera.Position.slice();
		AppCamera.LookAt = Camera.LookAt.slice();
		
		this.RegisterAssets();
		
		
		const ClearCommand = ['SetRenderTarget',null,ClearColour];

		const CameraUniforms = {};
		//	normalise viewport
		Viewport[0] = 0;
		Viewport[1] = 0;
		Viewport[3] /= Viewport[2];
		Viewport[2] /= Viewport[2];
		CameraUniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
		CameraUniforms.CameraToWorldTransform = Camera.GetLocalToWorldMatrix();
		CameraUniforms.CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
		CameraUniforms.DepthTexture = Camera.DepthImage || DefaultDepthTexture;
		CameraUniforms.NormalDepthToViewDepthTransform = CameraUniforms.DepthTexture.NormalDepthToViewDepthTransform || [];


		const CubeCommands = [];
		function PushCommand(Command)
		{
			CubeCommands.push(Command);
		}
		
		for ( let Voxels of this.Game.VoxelBuffers )
		{
			RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, Voxels, this.Game.OccupancyTexture );
		}
		
		this.Game.UpdateWeaponDesktop(Camera);
		
		//	weapon cube(shapes)
		for ( let Weapon of this.Game.GetWeapons() )
		{
			const Positions = Weapon.GetRenderLocalToWorldTransforms();
			const Velocitys = new Array(Positions.length).fill([0,0,0]);
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Positions, Velocitys, this.Game.OccupancyTexture );
		}
		
		//	projectile cubes
		{
			let Transforms = [];
			let Velocitys = [];
			function OnProjectile(Projectile)
			{
				Transforms.push( Projectile.LocalToWorldTransform );
				Velocitys.push( Projectile.Velocity );
			}
			this.Game.EnumProjectiles(OnProjectile);
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Transforms, Velocitys, this.Game.OccupancyTexture );
		}
		
		//	floor cube
		if ( RenderFloor )
		{
			let FloorCubeScale = 0.01;
			let FloorCubeWidth = FloorSize;
			let FloorCubeHeight = CubeSize * 1.0 * FloorCubeScale;
			let FloorZ = -5;
			let FloorX = -3;
			FloorCubeHeight += CubeSize * 2.0;
			let FloorTransform = PopMath.CreateTranslationScaleMatrix( [FloorX,-FloorCubeHeight,FloorZ], [FloorCubeWidth,FloorCubeScale,FloorCubeWidth] );
			
			let Transforms = [FloorTransform];
			let Velocitys = [[0,0,0]];
			let Colours = [FloorColour];
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Transforms, Velocitys, this.Game.OccupancyTexture, Colours );
		}
		
		//	dont do this in xr
		if ( RenderDebugQuads )
		{
			const DebugTextures = this.Game.GetDebugTextures();
			function Render(DebugTexture,Index)
			{
				const DrawTransparent = false;
				RenderDebugQuad( PushCommand, RenderContext, DebugTexture, Index, DrawTransparent );
			}
			DebugTextures.forEach( Render );
		}

		if ( RenderOctree )
		{
			const BoundingBoxes = GetBoundingBoxesFromOccupancy(this.Game.OccupancyTexture);
			RenderBoundingBoxes( PushCommand, RenderContext, CameraUniforms, BoundingBoxes );
		}

		return [ClearCommand,...CubeCommands];
	}
	
	Tick(TimestepSecs)
	{
		this.Game.Tick(TimestepSecs);
	}
	
	async GpuTick(RenderContext,TimestepSecs)
	{
		return this.Game.GpuTick(RenderContext,TimestepSecs);
	}
	
	async GameIteration()
	{
		//	create game
		await this.Game.RunGameIteration();
	}
}
